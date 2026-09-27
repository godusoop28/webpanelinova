import "server-only";
import type { ConversationControl, ConversationHandoffState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Lecturas y acciones del panel sobre conversaciones. Toda consulta va
 * filtrada por companyId; los permisos por rol se validan en las Server
 * Actions / páginas (lib/dal.ts) antes de llegar aquí.
 */

export type ConversationFilter = "all" | "attention" | "ai" | "waiting" | "human" | "paused" | "handed_off" | "errors" | "test";

export async function listConversations(input: {
  companyId: string;
  filter: ConversationFilter;
  search?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.ConversationWhereInput = { companyId: input.companyId };
  switch (input.filter) {
    case "attention":
      where.OR = [
        { control: { in: ["HUMAN", "PAUSED"] } },
        { escalations: { some: { status: { not: "RESOLVED" } } } },
        { lastError: { not: null } },
      ];
      break;
    case "ai":
      where.control = "AI";
      where.OR = [{ reopenAt: null }, { reopenAt: { lte: new Date() } }];
      break;
    case "waiting":
      where.control = "AI";
      where.reopenAt = { gt: new Date() };
      break;
    case "human":
      where.control = "HUMAN";
      break;
    case "paused":
      where.control = "PAUSED";
      break;
    case "handed_off":
      where.handoffState = { in: ["ASSIGNED", "EXISTING_LEAD"] };
      break;
    case "errors":
      where.OR = [
        { lastError: { not: null } },
        { handoffState: { in: ["FAILED", "NO_ADVISOR"] } },
        { messages: { some: { status: { in: ["FAILED", "UNCERTAIN"] } } } },
      ];
      break;
    case "test":
      where.isTest = true;
      break;
  }
  if (input.filter !== "test" && input.filter !== "all") where.isTest = false;
  if (input.search) {
    const search = input.search.trim();
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search.replace(/\s+/g, "") } },
          { manyChatSubscriberId: search },
        ],
      },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        lead: { select: { id: true, assignedAdvisor: { select: { name: true } } } },
        _count: { select: { escalations: { where: { status: { not: "RESOLVED" } } } } },
        messages: { orderBy: { seq: "desc" }, take: 1, select: { text: true, role: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ]);
  return { items, total };
}

export async function countAttentionItems(companyId: string) {
  const [pendingEscalations, humanControl, deliveryIssues] = await prisma.$transaction([
    prisma.conversationEscalation.count({ where: { companyId, status: { not: "RESOLVED" } } }),
    prisma.conversation.count({ where: { companyId, isTest: false, control: { in: ["HUMAN", "PAUSED"] } } }),
    prisma.conversationMessage.count({ where: { companyId, status: { in: ["FAILED", "UNCERTAIN"] }, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
  ]);
  return { pendingEscalations, humanControl, deliveryIssues };
}

export async function listOpenEscalations(companyId: string, limit = 50) {
  return prisma.conversationEscalation.findMany({
    where: { companyId, status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { conversation: { select: { id: true, name: true, phone: true, isTest: true } } },
  });
}

export async function getConversationDetail(companyId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, companyId },
    include: {
      messages: { orderBy: { seq: "asc" }, take: 500 },
      turns: { orderBy: { createdAt: "desc" }, take: 30 },
      escalations: { orderBy: { createdAt: "desc" } },
      lead: {
        include: {
          assignedAdvisor: { select: { id: true, name: true, phone: true } },
          assignments: { orderBy: { assignedAt: "desc" }, take: 1 },
        },
      },
    },
  });
}

async function assertConversation(companyId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, companyId } });
  if (!conversation) throw new Error("Conversación no encontrada.");
  return conversation;
}

/** Pausa la IA para este contacto. HUMAN: alguien del equipo responde en el mismo número; PAUSED: solo detenerla. */
export async function setConversationControl(input: {
  companyId: string;
  conversationId: string;
  control: Exclude<ConversationControl, "AI">;
  reason: string;
  by: string;
}) {
  await assertConversation(input.companyId, input.conversationId);
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      control: input.control,
      controlReason: input.reason.slice(0, 500),
      controlChangedAt: new Date(),
      controlChangedBy: input.by,
      processAfter: null,
      burstStartedAt: null,
    },
  });
}

/**
 * Reanuda la IA. Por defecto NO contesta mensajes que llegaron durante la
 * pausa (podrían ser viejos o ya atendidos por una persona): los marca como
 * vistos y la IA responde desde el próximo mensaje, con todo el historial
 * como contexto. `answerPending` sí los procesa ahora.
 */
export async function resumeConversationAi(input: { companyId: string; conversationId: string; by: string; answerPending: boolean }) {
  const conversation = await assertConversation(input.companyId, input.conversationId);
  const pending = conversation.processedSeq < conversation.lastSeq;
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      control: "AI",
      controlReason: `Reanudada por ${input.by}`,
      controlChangedAt: new Date(),
      controlChangedBy: input.by,
      consecutiveFailures: 0,
      lastError: null,
      ...(input.answerPending && pending
        ? { processAfter: new Date(), burstStartedAt: new Date() }
        : { processedSeq: conversation.lastSeq, processAfter: null, burstStartedAt: null }),
    },
  });
  return { willAnswer: input.answerPending && pending };
}

/** Nota de lo que una persona respondió fuera del bot (p. ej. desde la bandeja de ManyChat), para que la IA lo tenga en memoria. */
export async function recordHumanReply(input: { companyId: string; conversationId: string; text: string; by: string }) {
  await assertConversation(input.companyId, input.conversationId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${input.conversationId} FOR UPDATE`;
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: input.conversationId } });
    const seq = current.lastSeq + 1;
    await tx.conversationMessage.create({
      data: {
        conversationId: current.id,
        companyId: current.companyId,
        seq,
        role: "HUMAN_AGENT",
        text: input.text.slice(0, 2000),
        status: "SENT",
        metadata: { recordedBy: input.by, recordedFromPanel: true },
      },
    });
    const caughtUp = current.processedSeq === current.lastSeq;
    await tx.conversation.update({
      where: { id: current.id },
      data: { lastSeq: seq, ...(caughtUp ? { processedSeq: seq } : {}), lastActivityAt: new Date() },
    });
  });
}

export async function resolveEscalation(input: { companyId: string; escalationId: string; by: string; notes?: string }) {
  const escalation = await prisma.conversationEscalation.findFirst({ where: { id: input.escalationId, companyId: input.companyId } });
  if (!escalation) throw new Error("Pendiente no encontrado.");
  await prisma.conversationEscalation.update({
    where: { id: escalation.id },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: input.by, notes: input.notes?.slice(0, 1000) },
  });
}

/**
 * Reintento manual de un envío. FAILED se reencola directo; UNCERTAIN
 * (timeout) requiere confirmación explícita porque el cliente pudo haberlo
 * recibido ya.
 */
export async function requeueMessage(input: { companyId: string; messageId: string; confirmUncertain: boolean }) {
  const message = await prisma.conversationMessage.findFirst({ where: { id: input.messageId, companyId: input.companyId } });
  if (!message) throw new Error("Mensaje no encontrado.");
  if (message.status === "UNCERTAIN" && !input.confirmUncertain) {
    throw new Error("El envío es incierto: confirma que el cliente no lo recibió antes de reenviarlo.");
  }
  if (message.status !== "FAILED" && message.status !== "UNCERTAIN") throw new Error("Solo se reintentan envíos fallidos o inciertos.");
  await prisma.conversationMessage.update({ where: { id: message.id }, data: { status: "QUEUED", attempts: 0, lastError: null } });
  return message.conversationId;
}

export const CONTROL_LABELS: Record<ConversationControl, string> = {
  AI: "IA activa",
  HUMAN: "Pausada: atención humana",
  PAUSED: "Pausada manualmente",
};

export type ConversationStatus = { key: "ai" | "waiting" | "human" | "paused"; label: string; tone: "success" | "gold" | "warning" };

/**
 * Estado visible: pausa manual (una persona) > espera automática tras
 * canalizar > IA activa. La espera vence sola; la pausa manual no.
 */
export function conversationStatus(conversation: { control: ConversationControl; reopenAt: Date | null }, now = new Date()): ConversationStatus {
  if (conversation.control === "HUMAN") return { key: "human", label: CONTROL_LABELS.HUMAN, tone: "warning" };
  if (conversation.control === "PAUSED") return { key: "paused", label: CONTROL_LABELS.PAUSED, tone: "warning" };
  if (conversation.reopenAt && conversation.reopenAt.getTime() > now.getTime()) {
    const minutes = Math.max(1, Math.ceil((conversation.reopenAt.getTime() - now.getTime()) / 60_000));
    return { key: "waiting", label: `Esperando tras canalizar (${minutes} min)`, tone: "gold" };
  }
  return { key: "ai", label: CONTROL_LABELS.AI, tone: "success" };
}

export const HANDOFF_LABELS: Record<ConversationHandoffState, string> = {
  NONE: "Sin canalizar",
  ASSIGNED: "Asesor asignado",
  EXISTING_LEAD: "Lead existente",
  NO_ADVISOR: "Sin asesor disponible",
  FAILED: "Canalización fallida",
  NOT_APPLICABLE: "Gerencia / no comercial",
};
