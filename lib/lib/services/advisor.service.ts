import "server-only";
import type { Advisor } from "@prisma/client";
import {
  findManyAdvisors,
  findAdvisorById,
  createAdvisor,
  updateAdvisor,
  setAdvisorActive,
  setAdvisorPausedUntil,
} from "@/lib/repositories/advisor.repository";
import type { AdvisorUpsertInput } from "@/lib/repositories/advisor.repository";
import { dbAdvisorToView, dbIndefinitePauseDate, routeLabelsToAllowedFlags } from "@/lib/advisors";
import type { AdvisorView } from "@/lib/types";
import type { AdvisorInput } from "@/lib/schemas";
import { logAuditEvent } from "@/lib/services/audit.service";

export async function listAdvisorViews(companyId: string): Promise<AdvisorView[]> {
  const advisors = await findManyAdvisors(companyId);
  return advisors.map(dbAdvisorToView);
}

export async function getAdvisorView(id: string): Promise<AdvisorView | null> {
  const advisor = await findAdvisorById(id);
  return advisor ? dbAdvisorToView(advisor) : null;
}

function inputToUpsert(input: AdvisorInput): AdvisorUpsertInput {
  return {
    name: input.nombre,
    phone: input.whatsapp,
    easyBrokerEmail: input.emailEasyBroker || null,
    manyChatSubscriberId: input.manyChatId || null,
    active: input.activo,
    weight: input.peso,
    dailyLimit: input.limiteDiario,
    notes: input.observaciones || null,
    ...routeLabelsToAllowedFlags(input.rutasPermitidas),
  };
}

export async function createAdvisorFromInput(companyId: string, input: AdvisorInput): Promise<Advisor> {
  const advisor = await createAdvisor(companyId, inputToUpsert(input));
  await logAuditEvent({
    companyId,
    advisorId: advisor.id,
    eventType: "ADVISOR_CREATED",
    status: "ok",
    message: `Asesor creado: ${advisor.name}.`,
  });
  return advisor;
}

export async function updateAdvisorFromInput(id: string, input: AdvisorInput): Promise<Advisor> {
  const advisor = await updateAdvisor(id, inputToUpsert(input));
  await logAuditEvent({
    advisorId: advisor.id,
    eventType: "ADVISOR_UPDATED",
    status: "ok",
    message: `Asesor actualizado: ${advisor.name}.`,
  });
  return advisor;
}

export async function setAdvisorActiveState(id: string, active: boolean): Promise<Advisor> {
  const advisor = await setAdvisorActive(id, active);
  await logAuditEvent({
    advisorId: advisor.id,
    eventType: "ADVISOR_UPDATED",
    status: "ok",
    message: `Asesor ${advisor.name} ${active ? "activado" : "desactivado"}.`,
  });
  return advisor;
}

export async function pauseAdvisorUntil(id: string, until: Date | "INDEFINITE"): Promise<Advisor> {
  const advisor = await setAdvisorPausedUntil(id, until === "INDEFINITE" ? dbIndefinitePauseDate() : until);
  await logAuditEvent({
    advisorId: advisor.id,
    eventType: "ADVISOR_PAUSED",
    status: "ok",
    message: `Asesor ${advisor.name} pausado.`,
  });
  return advisor;
}

export async function resumeAdvisorNow(id: string): Promise<Advisor> {
  const advisor = await setAdvisorPausedUntil(id, null);
  await logAuditEvent({
    advisorId: advisor.id,
    eventType: "ADVISOR_RESUMED",
    status: "ok",
    message: `Asesor ${advisor.name} reanudado.`,
  });
  return advisor;
}
