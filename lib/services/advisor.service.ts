import "server-only";
import type { Advisor } from "@prisma/client";
import {
  findManyAdvisors,
  findAdvisorById,
  createAdvisor,
  updateAdvisor,
  setAdvisorActive,
  setAdvisorPausedUntil,
  upsertAdvisorByEasyBrokerEmail,
  type AdvisorUpsertInput,
} from "@/lib/repositories/advisor.repository";
import {
  dbAdvisorToView,
  dbIndefinitePauseDate,
  routeLabelsToAllowedFlags,
} from "@/lib/advisors";
import type { AdvisorRow } from "@/lib/google-sheets";
import type { AdvisorInput } from "@/lib/schemas";
import { getAdvisorRowsFresh } from "@/lib/google-sheets";
import { logAuditEvent } from "@/lib/services/audit.service";

export async function listAdvisorViews(companyId: string): Promise<AdvisorRow[]> {
  const advisors = await findManyAdvisors(companyId);
  return advisors.map(dbAdvisorToView);
}

export async function getAdvisorView(id: string): Promise<AdvisorRow | null> {
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
  return createAdvisor(companyId, inputToUpsert(input));
}

export async function updateAdvisorFromInput(id: string, input: AdvisorInput): Promise<Advisor> {
  return updateAdvisor(id, inputToUpsert(input));
}

export async function setAdvisorActiveState(id: string, active: boolean): Promise<Advisor> {
  return setAdvisorActive(id, active);
}

export async function pauseAdvisorUntil(id: string, until: Date | "INDEFINITE"): Promise<Advisor> {
  return setAdvisorPausedUntil(id, until === "INDEFINITE" ? dbIndefinitePauseDate() : until);
}

export async function resumeAdvisorNow(id: string): Promise<Advisor> {
  return setAdvisorPausedUntil(id, null);
}

export interface ImportAdvisorsSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { advisor: string; error: string }[];
}

/**
 * Fase 6: reads the CURRENT (uncached) Sheets "Asesores" rows read-only and
 * upserts them into Postgres keyed by easyBrokerEmail. Advisors without
 * that email can't be deduped safely against a re-run, so they're skipped
 * with a clear reason rather than risking duplicate rows (Fase 6: "NO crear
 * duplicados").
 */
export async function importAdvisorsFromSheets(companyId: string): Promise<ImportAdvisorsSummary> {
  const summary: ImportAdvisorsSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
  const sheetAdvisors = await getAdvisorRowsFresh();

  for (const row of sheetAdvisors) {
    const email = row.emailEasyBroker.trim().toLowerCase();
    if (!email) {
      summary.skipped += 1;
      summary.errors.push({
        advisor: row.nombre || `fila ${row.rowNumber}`,
        error: "Sin emailEasyBroker: no hay clave segura para deduplicar, se omite.",
      });
      continue;
    }

    try {
      const { created } = await upsertAdvisorByEasyBrokerEmail(companyId, email, {
        name: row.nombre,
        phone: row.whatsapp,
        easyBrokerEmail: email,
        manyChatSubscriberId: row.manyChatId || null,
        active: row.activo,
        weight: row.peso,
        dailyLimit: row.limiteDiario,
        pausedUntil: row.pausadoHasta
          ? row.pausadoHasta === "INDEFINIDO"
            ? dbIndefinitePauseDate()
            : new Date(row.pausadoHasta)
          : null,
        notes: row.observaciones || null,
        ...routeLabelsToAllowedFlags(row.rutasPermitidas),
      });
      if (created) summary.created += 1;
      else summary.updated += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({
        advisor: row.nombre || email,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  await logAuditEvent({
    companyId,
    eventType: "MIGRATION_ADVISORS_IMPORTED",
    status: summary.errors.length > 0 ? "warning" : "ok",
    message: `Importación de asesores: ${summary.created} creados, ${summary.updated} actualizados, ${summary.skipped} omitidos.`,
    metadata: { ...summary },
  });

  return summary;
}
