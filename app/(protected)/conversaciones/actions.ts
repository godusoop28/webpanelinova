"use server";

import crypto from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import {
  recordHumanReply,
  requeueMessage,
  resolveEscalation,
  resumeConversationAi,
  setConversationControl,
} from "@/lib/services/conversation-admin.service";
import { updateAssistantSettings } from "@/lib/services/assistant-settings.service";
import { ingestInboundMessage } from "@/lib/services/conversation.service";
import { flushOutbox, processConversation } from "@/lib/services/conversation-processor.service";
import { syncPropertyCatalog } from "@/lib/services/property-catalog.service";

export interface ConversationActionState {
  error?: string;
  success?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function setControlAction(
  conversationId: string,
  _prev: ConversationActionState,
  formData: FormData
): Promise<ConversationActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  const parsed = z
    .object({ control: z.enum(["HUMAN", "PAUSED"]), reason: z.string().trim().min(3, "Indica el motivo.").max(500) })
    .safeParse({ control: formData.get("control"), reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    await setConversationControl({ companyId: await getDefaultCompanyId(), conversationId, ...parsed.data, by: user.email });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/conversaciones/${conversationId}`);
  return { success: "La IA dejó de responder a este contacto." };
}

export async function resumeAiAction(
  conversationId: string,
  _prev: ConversationActionState,
  formData: FormData
): Promise<ConversationActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  const answerPending = formData.get("answerPending") === "on";
  try {
    const result = await resumeConversationAi({ companyId: await getDefaultCompanyId(), conversationId, by: user.email, answerPending });
    if (result.willAnswer) {
      after(() => processConversation(conversationId, 110_000).then(() => undefined));
    }
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/conversaciones/${conversationId}`);
  return { success: answerPending ? "IA reanudada; responderá los mensajes pendientes." : "IA reanudada desde el próximo mensaje." };
}

export async function recordHumanReplyAction(
  conversationId: string,
  _prev: ConversationActionState,
  formData: FormData
): Promise<ConversationActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2) return { error: "Escribe lo que se respondió al cliente." };
  try {
    await recordHumanReply({ companyId: await getDefaultCompanyId(), conversationId, text, by: user.email });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/conversaciones/${conversationId}`);
  return { success: "Respuesta registrada en la memoria de la conversación (no se envió nada al cliente)." };
}

export async function resolveEscalationAction(escalationId: string, conversationId: string, formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN", "DIRECCION");
  await resolveEscalation({
    companyId: await getDefaultCompanyId(),
    escalationId,
    by: user.email,
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  revalidatePath(`/conversaciones/${conversationId}`);
  revalidatePath("/conversaciones");
}

export async function requeueMessageAction(messageId: string, conversationId: string, formData: FormData): Promise<void> {
  await requireRole("ADMIN", "DIRECCION");
  await requeueMessage({
    companyId: await getDefaultCompanyId(),
    messageId,
    confirmUncertain: formData.get("confirmUncertain") === "on",
  });
  after(() => flushOutbox(conversationId));
  revalidatePath(`/conversaciones/${conversationId}`);
}

const SettingsSchema = z.object({
  mode: z.enum(["OFF", "TEST_ONLY", "ON"]),
  debounceSeconds: z.coerce.number().int().min(2).max(20),
  maxWaitSeconds: z.coerce.number().int().min(5).max(60),
  maxClarifications: z.coerce.number().int().min(1).max(6),
  abandonHandoffMinutes: z.coerce.number().int().min(0).max(24 * 60),
  existingLeadWindowDays: z.coerce.number().int().min(1).max(365),
  handoffReopenMinutes: z.coerce.number().int().min(0).max(24 * 60),
  testSubscriberIds: z.string().default(""),
  managementSubscriberIds: z.string().default(""),
});

function idList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((id) => id.trim()).filter((id) => /^\d{1,20}$/.test(id)))];
}

export async function saveAssistantSettingsAction(_prev: ConversationActionState, formData: FormData): Promise<ConversationActionState> {
  const user = await requireRole("ADMIN");
  const parsed = SettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const data = parsed.data;
  if (data.maxWaitSeconds < data.debounceSeconds) return { error: "La espera máxima debe ser mayor o igual al silencio de agrupación." };
  try {
    await updateAssistantSettings(
      await getDefaultCompanyId(),
      {
        ...data,
        testSubscriberIds: idList(data.testSubscriberIds),
        managementSubscriberIds: idList(data.managementSubscriberIds),
      },
      user.email
    );
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/conversaciones");
  return { success: "Configuración guardada." };
}

export async function syncCatalogAction(): Promise<ConversationActionState> {
  await requireRole("ADMIN");
  try {
    const summary = await syncPropertyCatalog(await getDefaultCompanyId());
    return { success: `Inventario sincronizado: ${summary.total} publicadas, ${summary.detailsFetched} detalles actualizados, ${summary.unpublished} despublicadas.` };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/**
 * Simulador: conversación de prueba (isTest) que recorre el mismo pipeline
 * real (persistencia, ráfagas, OpenAI, EasyBroker de solo lectura) pero
 * nunca envía WhatsApp, nunca crea leads ni mueve la ruleta.
 */
export async function simulateMessageAction(_prev: ConversationActionState, formData: FormData): Promise<ConversationActionState> {
  await requireRole("ADMIN");
  const text = String(formData.get("text") ?? "").trim();
  let subscriberId = String(formData.get("subscriberId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || "Contacto simulado";
  if (!text) return { error: "Escribe un mensaje." };
  if (!/^sim-[a-f0-9]{12}$/.test(subscriberId)) subscriberId = `sim-${crypto.randomBytes(6).toString("hex")}`;

  const companyId = await getDefaultCompanyId();
  const result = await ingestInboundMessage(companyId, {
    subscriberId,
    text,
    name,
    phone: "+520000000000",
    simulated: true,
    metadata: { simulator: true },
  });
  if (!result.duplicate && result.shouldProcess) {
    const conversationId = result.conversationId;
    after(() => processConversation(conversationId, 110_000).then(() => undefined));
  }
  redirect(`/conversaciones/simulador?c=${result.conversationId}&s=${subscriberId}`);
}
