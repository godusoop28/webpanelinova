import "server-only";
import { Prisma, type AssistantSettings, type Conversation } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhoneE164 } from "@/lib/phone";
import { buildInboundDedupeKey, computeProcessAfter } from "@/lib/conversation/burst";
import { extractEasyBrokerCodes } from "@/lib/conversation/property-reference";
import { assistantHandles, getAssistantSettings, isTestSubscriber } from "@/lib/services/assistant-settings.service";

export const MAX_INBOUND_TEXT = 4000;

/** Prefijo de los contactos creados por el simulador del panel. */
export const SIMULATOR_SUBSCRIBER_PREFIX = "sim-";

/**
 * Dos conceptos distintos:
 * - isTest (contacto de prueba o simulador): nunca crea leads ni mueve la ruleta.
 * - simulador: además nunca envía nada por WhatsApp.
 * Un contacto de prueba real (TEST_ONLY) SÍ recibe las respuestas en su WhatsApp.
 */
export function isSimulatorConversation(conversation: { manyChatSubscriberId: string }): boolean {
  return conversation.manyChatSubscriberId.startsWith(SIMULATOR_SUBSCRIBER_PREFIX);
}

export interface InboundMessageInput {
  subscriberId: string;
  text: string;
  phone?: string | null;
  name?: string | null;
  messageId?: string | null;
  interactionAt?: string | null;
  /** Simulador del panel: siempre de prueba, nunca envía ni crea leads. */
  simulated?: boolean;
  metadata?: Record<string, unknown>;
}

export type IngestResult =
  | { duplicate: true; conversationId: string; handled: boolean }
  | {
      duplicate: false;
      conversationId: string;
      seq: number;
      /** true: el backend se hace cargo (ManyChat NO debe correr el flujo anterior). */
      handled: boolean;
      /** true: hay que interpretar y responder (IA activa para este contacto). */
      shouldProcess: boolean;
      processAfter: Date | null;
    };

/**
 * Persiste el mensaje ANTES de confirmar recepción. Serializa por
 * conversación con un bloqueo de fila, así dos entregas simultáneas del
 * mismo contacto reciben números de secuencia consecutivos y nunca se
 * pisan. Idempotente ante reentregas con la misma clave de dedupe.
 */
export async function ingestInboundMessage(companyId: string, input: InboundMessageInput): Promise<IngestResult> {
  const settings = await getAssistantSettings(companyId);
  const text = input.text.slice(0, MAX_INBOUND_TEXT);
  const isTest = Boolean(input.simulated) || isTestSubscriber(settings, input.subscriberId);
  const dedupeKey = buildInboundDedupeKey({
    messageId: input.messageId,
    subscriberId: input.subscriberId,
    text,
    interactionAt: input.interactionAt,
  });
  const phone = normalizePhoneE164(input.phone) || null;
  const name = input.name?.trim().slice(0, 120) || null;

  const conversation = await upsertConversation(companyId, input.subscriberId, { phone, name, isTest });

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversation.id} FOR UPDATE`;
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversation.id } });

    const handledByAssistant = input.simulated ? true : assistantHandles(settings, input.subscriberId);

    if (dedupeKey) {
      const existing = await tx.conversationMessage.findUnique({
        where: { conversationId_dedupeKey: { conversationId: current.id, dedupeKey } },
        select: { id: true },
      });
      if (existing) return { duplicate: true as const, conversationId: current.id, handled: handledByAssistant };
    }

    const now = new Date();
    const seq = current.lastSeq + 1;
    await tx.conversationMessage.create({
      data: {
        conversationId: current.id,
        companyId,
        seq,
        role: "USER",
        text,
        status: "RECEIVED",
        dedupeKey,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    const campaignCode = current.campaignRef ? null : extractEasyBrokerCodes(text)[0] ?? null;
    const base: Prisma.ConversationUpdateInput = {
      lastSeq: seq,
      lastInboundAt: now,
      lastActivityAt: now,
      isTest: current.isTest || isTest,
      ...(phone && !current.phone ? { phone } : {}),
      ...(name ? { name } : {}),
      ...(campaignCode ? { campaignRef: campaignCode } : {}),
    };

    if (!handledByAssistant) {
      // IA apagada para este contacto: queda en memoria, pero no se
      // acumula como pendiente (al encender no se responde a mensajes viejos).
      await tx.conversation.update({ where: { id: current.id }, data: { ...base, processedSeq: seq, processAfter: null, burstStartedAt: null } });
      return { duplicate: false as const, conversationId: current.id, seq, handled: false, shouldProcess: false, processAfter: null };
    }

    if (current.control !== "AI") {
      // Una persona atiende o la IA está pausada: se guarda, no se contesta,
      // y ManyChat tampoco debe lanzar el flujo anterior encima.
      await tx.conversation.update({ where: { id: current.id }, data: base });
      return { duplicate: false as const, conversationId: current.id, seq, handled: true, shouldProcess: false, processAfter: null };
    }

    const hadPending = current.processedSeq < current.lastSeq;
    const burst = computeProcessAfter({
      now,
      burstStartedAt: hadPending ? current.burstStartedAt : null,
      settings,
    });
    await tx.conversation.update({
      where: { id: current.id },
      data: { ...base, processAfter: burst.processAfter, burstStartedAt: burst.burstStartedAt },
    });
    return {
      duplicate: false as const,
      conversationId: current.id,
      seq,
      handled: true,
      shouldProcess: true,
      processAfter: burst.processAfter,
    };
  });
}

async function upsertConversation(
  companyId: string,
  subscriberId: string,
  data: { phone: string | null; name: string | null; isTest: boolean }
): Promise<Conversation> {
  const where = { companyId_channel_manyChatSubscriberId: { companyId, channel: "whatsapp", manyChatSubscriberId: subscriberId } };
  try {
    return await prisma.conversation.upsert({
      where,
      create: { companyId, manyChatSubscriberId: subscriberId, phone: data.phone, name: data.name, isTest: data.isTest },
      update: {},
    });
  } catch (error) {
    // Dos primeros mensajes simultáneos del mismo contacto: uno gana el insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.conversation.findUniqueOrThrow({ where });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Lease: un solo procesador por conversación a la vez (persistente, no en
// memoria del proceso). Si el proceso muere, el lease vence y el cron lo retoma.
// ---------------------------------------------------------------------------

export const LEASE_MS = 150_000;

export async function tryClaimLease(conversationId: string, owner: string, now = new Date()): Promise<boolean> {
  const result = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }, { leaseOwner: owner }],
    },
    data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  return result.count === 1;
}

export async function releaseLease(conversationId: string, owner: string): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, leaseOwner: owner },
    data: { leaseOwner: null, leaseUntil: null },
  });
}

export async function loadSettingsFor(conversation: Pick<Conversation, "companyId">): Promise<AssistantSettings> {
  return getAssistantSettings(conversation.companyId);
}

/** Conversaciones con mensajes sin interpretar cuya ráfaga ya cerró y nadie procesa (recuperación por cron). */
export async function findConversationsDueForProcessing(limit: number, now = new Date()) {
  return prisma.conversation.findMany({
    where: {
      control: "AI",
      processAfter: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { processAfter: "asc" },
    take: limit,
    select: { id: true, companyId: true, lastSeq: true, processedSeq: true },
  });
}
