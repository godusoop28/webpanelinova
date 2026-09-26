/**
 * Pruebas de integración del asistente contra un PostgreSQL REAL de prueba
 * (nunca producción): persistencia, ráfagas, dedupe, lease, control de
 * versión, reintentos, envíos, pausa/reanudación y canalización con el
 * motor de asignación real en modo shadow (sin EasyBroker/ManyChat).
 * OpenAI y el envío por ManyChat se sustituyen por dobles controlables.
 *
 *   TEST_DATABASE_URL=postgresql://user@localhost:5544/inova_test \
 *     npx vitest run --config vitest.integration.config.ts
 *
 * Requiere haber corrido `prisma migrate deploy` contra esa base.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantSettings, Conversation, Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("next/server", async () => ({ ...(await vi.importActual<typeof import("next/server")>("next/server")), after: () => undefined }));

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB || /neon\.tech|amazonaws|vercel/i.test(TEST_DB)) {
  throw new Error("TEST_DATABASE_URL debe apuntar a una base local de prueba, nunca a producción.");
}
process.env.DATABASE_URL = TEST_DB;
delete process.env.AUTOMATION_MODE; // shadow: el motor corre completo sin llamadas externas
process.env.EASYBROKER_FALLBACK_AGENT_EMAIL = "contacto@c21inova.com";

const doubles = vi.hoisted(() => ({
  agentCalls: [] as { userTexts: string[] }[],
  agentImpl: null as null | ((input: { conversation: Conversation; history: { role: string; text: string }[] }) => Promise<unknown>),
  sent: [] as { subscriberId: string; text: string }[],
  sendImpl: null as null | ((subscriberId: string, text: string) => Promise<void>),
}));

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  return { prisma, isDatabaseConfigured: () => true };
});

vi.mock("@/lib/services/conversation-agent.service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/conversation-agent.service")>("@/lib/services/conversation-agent.service");
  return {
    ...actual,
    runAssistantTurn: async (input: { conversation: Conversation; history: { role: string; text: string }[] }) => {
      const lastAssistant = input.history.map((m) => m.role).lastIndexOf("ASSISTANT");
      doubles.agentCalls.push({ userTexts: input.history.slice(lastAssistant + 1).filter((m) => m.role === "USER").map((m) => m.text) });
      if (doubles.agentImpl) return doubles.agentImpl(input);
      return fakeResult("Respuesta de prueba");
    },
  };
});

vi.mock("@/lib/services/manychat.service", async () => {
  const client = await vi.importActual<typeof import("@/lib/integrations/manychat.client")>("@/lib/integrations/manychat.client");
  return {
    ManyChatApiError: client.ManyChatApiError,
    ManyChatTimeoutError: client.ManyChatTimeoutError,
    sendWhatsAppText: async (subscriberId: string, text: string) => {
      if (doubles.sendImpl) return doubles.sendImpl(subscriberId, text);
      doubles.sent.push({ subscriberId, text });
    },
    notifyAdvisor: async () => ({ customFieldsUpdated: true }),
    setCustomFields: async () => undefined,
    sendFlow: async () => undefined,
  };
});

vi.mock("@/lib/services/easybroker.service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/easybroker.service")>("@/lib/services/easybroker.service");
  return {
    ...actual,
    getProperty: async (id: string) => ({ public_id: id, title: "Casa de prueba", agent: { email: "contacto@c21inova.com" } }),
  };
});

function emptyFacts() {
  return Object.fromEntries(
    ["name", "operation", "property_type", "zone", "budget_min", "budget_max", "currency", "bedrooms", "timeframe", "own_property_location", "financing", "notes"].map((k) => [
      k,
      { value: null, status: "unknown" },
    ])
  );
}

function fakeResult(reply: string, overrides: Record<string, unknown> = {}) {
  return {
    final: {
      reply,
      primary_intent: "RENT",
      secondary_intents: [],
      facts: emptyFacts(),
      property_ids: [],
      summary: "Resumen de prueba",
      asked_clarification: false,
      made_progress: true,
      ...overrides,
    },
    facts: {},
    verifiedProperties: [],
    toolTrace: [],
    usage: { inputTokens: 10, outputTokens: 5 },
    humanRequested: false,
    handoff: null,
    corrections: 0,
    model: "fake",
  };
}

type Modules = {
  prisma: typeof import("@/lib/db").prisma;
  ingest: typeof import("@/lib/services/conversation.service").ingestInboundMessage;
  processConversation: typeof import("@/lib/services/conversation-processor.service").processConversation;
  flushOutbox: typeof import("@/lib/services/conversation-processor.service").flushOutbox;
  sweep: typeof import("@/lib/services/conversation-processor.service").sweepConversations;
  handoff: typeof import("@/lib/services/conversation-handoff.service").requestCommercialHandoff;
  admin: typeof import("@/lib/services/conversation-admin.service");
};
let m: Modules;
let companyId: string;
let subscriberCounter = 1000;

async function setSettings(data: Partial<AssistantSettings>) {
  await m.prisma.assistantSettings.upsert({
    where: { companyId },
    create: { companyId, ...data },
    update: data,
  });
}

function nextSubscriber() {
  subscriberCounter += 1;
  return String(subscriberCounter);
}

beforeAll(async () => {
  const db = await import("@/lib/db");
  const conv = await import("@/lib/services/conversation.service");
  const proc = await import("@/lib/services/conversation-processor.service");
  const handoff = await import("@/lib/services/conversation-handoff.service");
  const admin = await import("@/lib/services/conversation-admin.service");
  m = {
    prisma: db.prisma,
    ingest: conv.ingestInboundMessage,
    processConversation: proc.processConversation,
    flushOutbox: proc.flushOutbox,
    sweep: proc.sweepConversations,
    handoff: handoff.requestCommercialHandoff,
    admin,
  };
  // Base local de prueba (verificado arriba): se parte de cero en cada corrida.
  await m.prisma.$executeRawUnsafe(
    `TRUNCATE conversation_messages, conversation_turns, conversation_escalations, conversations, assistant_settings, property_cache,
      integration_jobs, audit_logs, lead_assignments, leads, advisors RESTART IDENTITY CASCADE`
  );
  const company = await m.prisma.company.upsert({
    where: { slug: "century21-innova" },
    create: { name: "Century 21 Innova", slug: "century21-innova" },
    update: {},
  });
  companyId = company.id;
});

afterAll(async () => {
  await m.prisma.$disconnect();
});

beforeEach(async () => {
  doubles.agentCalls = [];
  doubles.agentImpl = null;
  doubles.sent = [];
  doubles.sendImpl = null;
  await setSettings({ mode: "ON", debounceSeconds: 1, maxWaitSeconds: 5, testSubscriberIds: [], abandonHandoffMinutes: 30, existingLeadWindowDays: 30 });
});

async function conversationOf(subscriberId: string) {
  return m.prisma.conversation.findFirstOrThrow({ where: { companyId, manyChatSubscriberId: subscriberId }, include: { messages: { orderBy: { seq: "asc" } } } });
}

describe("recepción y ráfagas", () => {
  it("5 mensajes seguidos → una sola interpretación y una sola respuesta, en orden", async () => {
    const sub = nextSubscriber();
    for (const text of ["Hola", "Busco casa", "Para rentar", "En Zapopan", "Máximo 15 mil"]) {
      const r = await m.ingest(companyId, { subscriberId: sub, text, phone: "3312345678", name: "Ana" });
      expect(r.duplicate).toBe(false);
    }
    const conv = await conversationOf(sub);
    expect(await m.processConversation(conv.id, 60_000)).toBe("processed");
    expect(doubles.agentCalls).toHaveLength(1);
    expect(doubles.agentCalls[0].userTexts).toEqual(["Hola", "Busco casa", "Para rentar", "En Zapopan", "Máximo 15 mil"]);
    expect(doubles.sent).toEqual([{ subscriberId: sub, text: "Respuesta de prueba" }]);
    const after = await conversationOf(sub);
    expect(after.messages.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(after.messages[5]).toMatchObject({ role: "ASSISTANT", status: "SENT" });
    expect(after.processedSeq).toBe(6);
    expect(after.phone).toBe("+523312345678");
  });

  it("webhook repetido (misma marca de ManyChat) no duplica; el mismo texto más tarde sí se guarda", async () => {
    const sub = nextSubscriber();
    const a = await m.ingest(companyId, { subscriberId: sub, text: "sí", interactionAt: "2026-09-26T10:00:00Z" });
    const b = await m.ingest(companyId, { subscriberId: sub, text: "sí", interactionAt: "2026-09-26T10:00:00Z" });
    const c = await m.ingest(companyId, { subscriberId: sub, text: "sí", interactionAt: "2026-09-26T10:00:07Z" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(c.duplicate).toBe(false);
    expect((await conversationOf(sub)).messages).toHaveLength(2);
  });

  it("entregas concurrentes del mismo contacto reciben secuencias consecutivas sin pisarse", async () => {
    const sub = nextSubscriber();
    await Promise.all(Array.from({ length: 8 }, (_, i) => m.ingest(companyId, { subscriberId: sub, text: `m${i}` })));
    const conv = await conversationOf(sub);
    expect(conv.messages.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(conv.lastSeq).toBe(8);
  });

  it("dos procesadores en paralelo: solo uno interpreta (lease)", async () => {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "hola" });
    const conv = await conversationOf(sub);
    await Promise.all([m.processConversation(conv.id, 60_000), m.processConversation(conv.id, 60_000)]);
    expect(doubles.agentCalls).toHaveLength(1);
    expect(doubles.sent).toHaveLength(1);
  });

  it("mensaje que llega mientras OpenAI trabaja: no se descarta ni se responde con contexto viejo", async () => {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "busco depa" });
    const conv = await conversationOf(sub);
    let first = true;
    doubles.agentImpl = async (input) => {
      if (first) {
        first = false;
        await m.ingest(companyId, { subscriberId: sub, text: "en renta, perdón" });
        return fakeResult("respuesta obsoleta");
      }
      return fakeResult(`ok: ${input.history.filter((h) => h.role === "USER").map((h) => h.text).join(" / ")}`);
    };
    await m.processConversation(conv.id, 60_000);
    expect(doubles.agentCalls).toHaveLength(2);
    expect(doubles.agentCalls[1].userTexts).toEqual(["busco depa", "en renta, perdón"]);
    expect(doubles.sent.map((s) => s.text)).toEqual(["ok: busco depa / en renta, perdón"]);
    const turns = await m.prisma.conversationTurn.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
    expect(turns.map((t) => t.status)).toEqual(["SUPERSEDED", "COMPLETED"]);
  });
});

describe("fallos", () => {
  it("OpenAI falla: conserva el mensaje, reintenta acotado y al final responde una sola vez con texto fijo y pasa a humano", async () => {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "hola" });
    const conv = await conversationOf(sub);
    doubles.agentImpl = async () => {
      throw new Error("[OPENAI] Timeout");
    };
    for (let attempt = 0; attempt < 4; attempt++) {
      await m.prisma.conversation.update({ where: { id: conv.id }, data: { processAfter: new Date() } });
      await m.processConversation(conv.id, 60_000);
    }
    const after = await conversationOf(sub);
    expect(doubles.agentCalls).toHaveLength(4);
    expect(after.messages[0]).toMatchObject({ role: "USER", text: "hola" });
    expect(after.messages.filter((x) => x.role === "ASSISTANT")).toHaveLength(1);
    expect(doubles.sent).toHaveLength(1);
    expect(after.control).toBe("HUMAN");
    expect(await m.prisma.conversationEscalation.count({ where: { conversationId: conv.id, type: "PROCESSING_ERROR" } })).toBe(1);
  });

  it("ManyChat responde error: reintenta hasta 3 y luego FALLIDO visible; nunca 'enviado'", async () => {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "hola" });
    const conv = await conversationOf(sub);
    const { ManyChatApiError } = await import("@/lib/integrations/manychat.client");
    let calls = 0;
    doubles.sendImpl = async () => {
      calls += 1;
      throw new ManyChatApiError(500, "Server Error", { status: "error" });
    };
    await m.processConversation(conv.id, 60_000);
    await m.flushOutbox(conv.id);
    await m.flushOutbox(conv.id);
    const msg = (await conversationOf(sub)).messages.find((x) => x.role === "ASSISTANT")!;
    expect(calls).toBe(3);
    expect(msg.status).toBe("FAILED");
    expect(msg.sentAt).toBeNull();
  });

  it("timeout de ManyChat: queda INCIERTO y no se reenvía solo (evita duplicar)", async () => {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "hola" });
    const conv = await conversationOf(sub);
    const { ManyChatTimeoutError } = await import("@/lib/integrations/manychat.client");
    let calls = 0;
    doubles.sendImpl = async () => {
      calls += 1;
      throw new ManyChatTimeoutError("POST /fb/sending/sendContent", 12000);
    };
    await m.processConversation(conv.id, 60_000);
    await m.flushOutbox(conv.id);
    expect(calls).toBe(1);
    expect((await conversationOf(sub)).messages.find((x) => x.role === "ASSISTANT")!.status).toBe("UNCERTAIN");
    await expect(m.admin.requeueMessage({ companyId, messageId: (await conversationOf(sub)).messages[1].id, confirmUncertain: false })).rejects.toThrow();
  });

  it("fuera de la ventana de 24 h no intenta texto libre", async () => {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "hola" });
    const conv = await conversationOf(sub);
    await m.processConversation(conv.id, 60_000);
    doubles.sent = [];
    await m.prisma.conversationMessage.create({
      data: { conversationId: conv.id, companyId, seq: 99, role: "ASSISTANT", text: "tarde", status: "QUEUED" },
    });
    await m.prisma.conversation.update({ where: { id: conv.id }, data: { lastInboundAt: new Date(Date.now() - 25 * 3600_000) } });
    await m.flushOutbox(conv.id);
    expect(doubles.sent).toEqual([]);
    expect((await m.prisma.conversationMessage.findFirstOrThrow({ where: { conversationId: conv.id, seq: 99 } })).status).toBe("FAILED");
  });
});

describe("control humano y modos", () => {
  it("con atención humana el bot no habla encima; al reanudar no contesta mensajes viejos", async () => {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "hola" });
    const conv = await conversationOf(sub);
    await m.admin.setConversationControl({ companyId, conversationId: conv.id, control: "HUMAN", reason: "la atiende gerencia", by: "test" });
    const r = await m.ingest(companyId, { subscriberId: sub, text: "¿sigue ahí?" });
    expect(r).toMatchObject({ handled: true, shouldProcess: false });
    await m.processConversation(conv.id, 60_000);
    expect(doubles.agentCalls).toHaveLength(0);
    await m.admin.resumeConversationAi({ companyId, conversationId: conv.id, by: "test", answerPending: false });
    await m.processConversation(conv.id, 60_000);
    expect(doubles.agentCalls).toHaveLength(0);
    await m.ingest(companyId, { subscriberId: sub, text: "quiero rentar" });
    await m.processConversation(conv.id, 60_000);
    expect(doubles.agentCalls).toHaveLength(1);
    expect(doubles.sent).toHaveLength(1);
  });

  it("contacto de prueba real (TEST_ONLY) SÍ recibe la respuesta; el simulador del panel no envía nada", async () => {
    const tester = nextSubscriber();
    await setSettings({ mode: "TEST_ONLY", testSubscriberIds: [tester] });
    await m.ingest(companyId, { subscriberId: tester, text: "tengo una casa que quiero vender" });
    const conv = await conversationOf(tester);
    expect(conv.isTest).toBe(true);
    await m.processConversation(conv.id, 60_000);
    expect(doubles.sent).toEqual([{ subscriberId: tester, text: "Respuesta de prueba" }]);

    doubles.sent = [];
    const sim = `sim-${"a".repeat(12)}`;
    await m.ingest(companyId, { subscriberId: sim, text: "hola", simulated: true });
    const simConv = await conversationOf(sim);
    await m.processConversation(simConv.id, 60_000);
    expect(doubles.sent).toEqual([]);
    expect((await conversationOf(sim)).messages.find((x) => x.role === "ASSISTANT")?.status).toBe("SIMULATED");
  });

  it("modo OFF: se guarda pero handled=false (ManyChat sigue con el flujo anterior); TEST_ONLY solo atiende pruebas", async () => {
    const sub = nextSubscriber();
    await setSettings({ mode: "OFF" });
    expect(await m.ingest(companyId, { subscriberId: sub, text: "hola" })).toMatchObject({ handled: false, shouldProcess: false });
    await setSettings({ mode: "TEST_ONLY", testSubscriberIds: [] });
    expect(await m.ingest(companyId, { subscriberId: sub, text: "hola" })).toMatchObject({ handled: false });
    await setSettings({ mode: "TEST_ONLY", testSubscriberIds: [sub] });
    expect(await m.ingest(companyId, { subscriberId: sub, text: "hola" })).toMatchObject({ handled: true, shouldProcess: true });
    const conv = await conversationOf(sub);
    expect(conv.isTest).toBe(true);
    expect(conv.messages).toHaveLength(3);
  });
});

describe("canalización con el motor de asignación existente", () => {
  let advisorId: string;
  beforeAll(async () => {
    const advisor = await m.prisma.advisor.create({
      data: { companyId, name: "Laura Prueba", phone: "+523300000001", weight: 5, allowedExplore: true, allowedTimeout: true, allowedProperty: true, allowedCampaign: true },
    });
    advisorId = advisor.id;
  });

  async function makeConversation(overrides: Prisma.ConversationUncheckedUpdateInput = {}) {
    const sub = nextSubscriber();
    await m.ingest(companyId, { subscriberId: sub, text: "hola", phone: `33${sub}0000`.slice(0, 10), name: "Cliente" });
    const conv = await m.prisma.conversation.update({ where: { id: (await conversationOf(sub)).id }, data: overrides });
    const settings = await m.prisma.assistantSettings.findUniqueOrThrow({ where: { companyId } });
    return { conv, settings };
  }

  const handoffInput = { secondaryIntents: [], facts: {}, summary: "Busca rentar en Zapopan", reason: "Renta en Zapopan", propertyPublicId: null, trigger: "assistant" as const };

  it("crea UN lead y UNA asignación; repetir la solicitud no reasigna", async () => {
    const { conv, settings } = await makeConversation();
    const first = await m.handoff({ conversation: conv, settings, primaryIntent: "RENT", ...handoffInput });
    expect(first).toMatchObject({ status: "assigned", assignment_recorded: true, advisor_first_name: "Laura" });
    const again = await m.handoff({
      conversation: await m.prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      settings,
      primaryIntent: "RENT",
      ...handoffInput,
    });
    expect(again.status).toBe("already_assigned");
    const fresh = await m.prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(await m.prisma.leadAssignment.count({ where: { leadId: fresh.leadId! } })).toBe(1);
    const lead = await m.prisma.lead.findUniqueOrThrow({ where: { id: fresh.leadId! } });
    expect(lead).toMatchObject({ interestType: "EXPLORE", route: "Explorar opciones", origin: "WhatsApp IA", assignedAdvisorId: advisorId });
  });

  it("proveedor nunca entra a la ruleta", async () => {
    const { conv, settings } = await makeConversation();
    const before = await m.prisma.leadAssignment.count();
    const r = await m.handoff({ conversation: conv, settings, primaryIntent: "PROVIDER", ...handoffInput, trigger: "abandonment" });
    expect(r.status).toBe("rejected");
    expect(await m.prisma.leadAssignment.count()).toBe(before);
  });

  it("conversación de prueba: dice a quién tocaría sin crear lead ni mover conteos", async () => {
    const { conv, settings } = await makeConversation({ isTest: true });
    const leads = await m.prisma.lead.count();
    const assignments = await m.prisma.leadAssignment.count();
    const r = await m.handoff({ conversation: conv, settings, primaryIntent: "BUY", ...handoffInput });
    expect(r).toMatchObject({ status: "assigned", simulated: true, assignment_recorded: false });
    expect(await m.prisma.lead.count()).toBe(leads);
    expect(await m.prisma.leadAssignment.count()).toBe(assignments);
  });

  it("teléfono con lead reciente (p. ej. del flujo anterior): se vincula sin reasignar", async () => {
    const { conv, settings } = await makeConversation();
    const existing = await m.prisma.lead.create({
      data: { companyId, name: "Cliente", phone: conv.phone!, interestType: "PROPERTY", source: "manychat_webhook", assignedAdvisorId: advisorId },
    });
    const r = await m.handoff({ conversation: conv, settings, primaryIntent: "BUY", ...handoffInput });
    expect(r.status).toBe("existing_lead");
    const fresh = await m.prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(fresh).toMatchObject({ leadId: existing.id, handoffState: "EXISTING_LEAD" });
    expect(await m.prisma.conversationEscalation.count({ where: { conversationId: conv.id, type: "FOLLOW_UP" } })).toBe(1);
  });

  it("sin asesores disponibles: pendiente visible, sin afirmar asignación", async () => {
    await m.prisma.advisor.update({ where: { id: advisorId }, data: { active: false } });
    try {
      const { conv, settings } = await makeConversation();
      const r = await m.handoff({ conversation: conv, settings, primaryIntent: "SELL", ...handoffInput });
      expect(r.status).toBe("no_advisor_available");
      const fresh = await m.prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(fresh.handoffState).toBe("NO_ADVISOR");
      expect(await m.prisma.conversationEscalation.count({ where: { conversationId: conv.id, type: "HUMAN" } })).toBe(1);
    } finally {
      await m.prisma.advisor.update({ where: { id: advisorId }, data: { active: true } });
    }
  });

  it("abandono con interés confirmado → Timeout; proveedor o solo 'hola' → nunca", async () => {
    const old = new Date(Date.now() - 45 * 60_000);
    const later = new Date(old.getTime() + 5_000);
    const { conv: renter } = await makeConversation({ primaryIntent: "RENT", lastInboundAt: old, lastOutboundAt: later, processAfter: null });
    const { conv: provider } = await makeConversation({ primaryIntent: "PROVIDER", lastInboundAt: old, lastOutboundAt: later, processAfter: null });
    const { conv: hello } = await makeConversation({ primaryIntent: "UNKNOWN", lastInboundAt: old, lastOutboundAt: later, processAfter: null });
    for (const c of [renter, provider, hello]) {
      await m.prisma.conversation.update({ where: { id: c.id }, data: { processedSeq: c.lastSeq } });
    }
    await m.sweep(60_000);
    const r = await m.prisma.conversation.findUniqueOrThrow({ where: { id: renter.id }, include: { lead: true } });
    expect(r.handoffState).toBe("ASSIGNED");
    expect(r.lead?.route).toBe("Timeout");
    expect((await m.prisma.conversation.findUniqueOrThrow({ where: { id: provider.id } })).handoffState).toBe("NONE");
    expect((await m.prisma.conversation.findUniqueOrThrow({ where: { id: hello.id } })).handoffState).toBe("NONE");
  });
});

describe("endpoint /api/webhooks/manychat/message", () => {
  it("autentica, valida, persiste y responde handled sin esperar a la IA", async () => {
    process.env.INTEGRATION_SECRET = "test-secret";
    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/webhooks/manychat/message/route");
    const call = (body: string, secret = "test-secret") =>
      POST(new NextRequest("http://localhost/api/webhooks/manychat/message", { method: "POST", body, headers: { "x-inova-secret": secret } }));

    expect((await call("{}", "wrong")).status).toBe(401);
    expect((await call('{"subscriber_id":"abc"}')).status).toBe(422);
    expect((await call("x".repeat(17_000))).status).toBe(413);

    const sub = nextSubscriber();
    // Texto crudo con salto de línea, tal como lo interpola ManyChat; campos sin reemplazar ignorados.
    const res = await call(`{"subscriber_id":"${sub}","text":"Hola\nquiero rentar","phone":"{{phone}}","name":"Ana","last_interaction":"2026-09-26T10:00:00Z"}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, handled: "true", duplicate: false });
    const repeat = await call(`{"subscriber_id":"${sub}","text":"Hola\nquiero rentar","last_interaction":"2026-09-26T10:00:00Z"}`);
    expect(await repeat.json()).toMatchObject({ duplicate: true });
    const conv = await conversationOf(sub);
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0].text).toBe("Hola\nquiero rentar");
    expect(conv.phone).toBeNull();

    await setSettings({ mode: "OFF" });
    const off = await call(`{"subscriber_id":"${nextSubscriber()}","text":"hola"}`);
    expect(await off.json()).toMatchObject({ handled: "false" });
  });
});
