import "server-only";
import type { AssistantMode, AssistantSettings } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Configuración operativa del asistente (no secreta), editable desde el
 * panel por ADMIN. Arranca en OFF: desplegar el código no cambia nada para
 * los clientes hasta que alguien lo activa.
 */
export async function getAssistantSettings(companyId: string): Promise<AssistantSettings> {
  const existing = await prisma.assistantSettings.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.assistantSettings.upsert({
    where: { companyId },
    create: { companyId },
    update: {},
  });
}

/** El interruptor de emergencia del hosting (ASSISTANT_DISABLED=true) gana siempre. */
export function effectiveMode(settings: Pick<AssistantSettings, "mode">): AssistantMode {
  return env.assistant.killSwitch ? "OFF" : settings.mode;
}

export function isTestSubscriber(settings: Pick<AssistantSettings, "testSubscriberIds">, subscriberId: string): boolean {
  return settings.testSubscriberIds.includes(subscriberId);
}

/** ¿Debe el asistente atender a este contacto? (independiente de pausas por conversación). */
export function assistantHandles(settings: AssistantSettings, subscriberId: string): boolean {
  const mode = effectiveMode(settings);
  if (mode === "ON") return true;
  if (mode === "TEST_ONLY") return isTestSubscriber(settings, subscriberId);
  return false;
}

export interface AssistantSettingsUpdate {
  mode: AssistantMode;
  debounceSeconds: number;
  maxWaitSeconds: number;
  maxClarifications: number;
  abandonHandoffMinutes: number;
  existingLeadWindowDays: number;
  testSubscriberIds: string[];
  managementSubscriberIds: string[];
}

export async function updateAssistantSettings(companyId: string, update: AssistantSettingsUpdate, updatedBy: string) {
  await getAssistantSettings(companyId);
  return prisma.assistantSettings.update({ where: { companyId }, data: { ...update, updatedBy } });
}
