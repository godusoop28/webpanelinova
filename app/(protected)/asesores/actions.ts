"use server";

import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/dal";
import {
  addAdvisor,
  pauseAdvisor,
  resumeAdvisor,
  toggleAdvisor,
  updateAdvisor,
  getAdvisorRowsFresh,
} from "@/lib/google-sheets";
import {
  AdvisorInputSchema,
  PauseAdvisorInputSchema,
  SimulateDistributionInputSchema,
  type AdvisorInput,
} from "@/lib/schemas";
import { PAUSE_INDEFINITE } from "@/lib/advisors";
import { mexicoCityTomorrowAt, mexicoCityWallTimeToUtc } from "@/lib/timezone";
import { getRotationCandidates, selectWeightedAdvisor } from "@/lib/assignment";
import { getDataSource, isDemoModeActive } from "@/lib/env";
import { getDefaultCompanyId } from "@/lib/company";
import {
  createAdvisorFromInput,
  updateAdvisorFromInput,
  setAdvisorActiveState,
  pauseAdvisorUntil,
  resumeAdvisorNow,
} from "@/lib/services/advisor.service";

export interface AdvisorFormState {
  error?: string;
  success?: boolean;
}

/**
 * Same precedence documented in lib/env.ts: demo mode always wins, and
 * DATA_SOURCE otherwise defaults to the legacy Sheets path. Writes go
 * through whichever source the reads are coming from — mixing them would
 * silently desync the two.
 */
function usingDatabase(): boolean {
  return !isDemoModeActive() && getDataSource() === "database";
}

/** Sheets writes are still keyed by row position; the UI only knows `id` now (Fase 64). */
async function resolveSheetRowNumber(id: string): Promise<number | null> {
  const advisors = await getAdvisorRowsFresh();
  return advisors.find((advisor) => advisor.id === id)?.rowNumber ?? null;
}

function parseAdvisorFormData(formData: FormData): Record<string, unknown> {
  const limiteDiarioRaw = String(formData.get("limiteDiario") ?? "").trim();
  return {
    nombre: formData.get("nombre"),
    whatsapp: formData.get("whatsapp"),
    rol: formData.get("rol"),
    tipoAsignacion: formData.get("tipoAsignacion"),
    emailEasyBroker: formData.get("emailEasyBroker") ?? "",
    manyChatId: formData.get("manyChatId") ?? "",
    activo: formData.get("activo") === "on",
    peso: formData.get("peso"),
    rutasPermitidas: formData.getAll("rutasPermitidas"),
    limiteDiario: limiteDiarioRaw === "" ? null : limiteDiarioRaw,
    observaciones: formData.get("observaciones") ?? "",
  };
}

function revalidateAdvisors() {
  revalidateTag("advisors", { expire: 0 });
}

export async function createAdvisorAction(
  _prevState: AdvisorFormState,
  formData: FormData
): Promise<AdvisorFormState> {
  await requireRole("ADMIN", "DIRECCION");

  const parsed = AdvisorInputSchema.safeParse(parseAdvisorFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    if (usingDatabase()) {
      const companyId = await getDefaultCompanyId();
      await createAdvisorFromInput(companyId, parsed.data as AdvisorInput);
    } else {
      await addAdvisor(parsed.data as AdvisorInput);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateAdvisors();
  return { success: true };
}

export async function updateAdvisorAction(
  id: string,
  currentPausadoHasta: string | null,
  _prevState: AdvisorFormState,
  formData: FormData
): Promise<AdvisorFormState> {
  await requireRole("ADMIN", "DIRECCION");

  const parsed = AdvisorInputSchema.safeParse(parseAdvisorFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    if (usingDatabase()) {
      await updateAdvisorFromInput(id, parsed.data as AdvisorInput);
    } else {
      const rowNumber = await resolveSheetRowNumber(id);
      if (rowNumber === null) return { error: "Asesor no encontrado en la hoja." };
      await updateAdvisor(rowNumber, id, parsed.data as AdvisorInput, currentPausadoHasta);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateAdvisors();
  return { success: true };
}

export async function toggleAdvisorAction(id: string, activo: boolean): Promise<void> {
  await requireRole("ADMIN", "DIRECCION");
  try {
    if (usingDatabase()) {
      await setAdvisorActiveState(id, activo);
    } else {
      const rowNumber = await resolveSheetRowNumber(id);
      if (rowNumber === null) return;
      await toggleAdvisor(rowNumber, activo);
    }
  } catch {
    return;
  }
  revalidateAdvisors();
}

export async function pauseAdvisorAction(
  id: string,
  _prevState: AdvisorFormState,
  formData: FormData
): Promise<AdvisorFormState> {
  await requireRole("ADMIN", "DIRECCION");

  const parsed = PauseAdvisorInputSchema.safeParse({
    mode: formData.get("mode"),
    customDateTime: formData.get("customDateTime") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos de pausa inválidos." };
  }

  let pausadoHasta: string;
  switch (parsed.data.mode) {
    case "1h":
      pausadoHasta = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      break;
    case "tomorrow_9am":
      pausadoHasta = mexicoCityTomorrowAt(9, 0).toISOString();
      break;
    case "indefinite":
      pausadoHasta = PAUSE_INDEFINITE;
      break;
    case "custom": {
      const [datePart, timePart] = parsed.data.customDateTime.split("T");
      const [year, month, day] = (datePart ?? "").split("-").map(Number);
      const [hour, minute] = (timePart ?? "").split(":").map(Number);
      if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
        return { error: "Fecha y hora de pausa inválidas." };
      }
      pausadoHasta = mexicoCityWallTimeToUtc(year, month, day, hour, minute).toISOString();
      break;
    }
  }

  try {
    if (usingDatabase()) {
      await pauseAdvisorUntil(id, pausadoHasta === PAUSE_INDEFINITE ? "INDEFINITE" : new Date(pausadoHasta));
    } else {
      const rowNumber = await resolveSheetRowNumber(id);
      if (rowNumber === null) return { error: "Asesor no encontrado en la hoja." };
      await pauseAdvisor(rowNumber, pausadoHasta);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateAdvisors();
  return { success: true };
}

export async function resumeAdvisorAction(id: string): Promise<void> {
  await requireRole("ADMIN", "DIRECCION");
  try {
    if (usingDatabase()) {
      await resumeAdvisorNow(id);
    } else {
      const rowNumber = await resolveSheetRowNumber(id);
      if (rowNumber === null) return;
      await resumeAdvisor(rowNumber);
    }
  } catch {
    return;
  }
  revalidateAdvisors();
}

export interface DistributionTestState {
  error?: string;
  results?: { id: string; nombre: string; count: number }[];
  totalCandidates?: number;
}

/**
 * Runs the weighted pick many times in memory against a single fresh fetch
 * of candidates. Never creates a lead, never calls EasyBroker/ManyChat —
 * purely a local simulation to validate weights visually.
 */
export async function simulateDistributionAction(
  _prevState: DistributionTestState,
  formData: FormData
): Promise<DistributionTestState> {
  await requireRole("ADMIN", "DIRECCION");

  const parsed = SimulateDistributionInputSchema.safeParse({
    route: formData.get("route"),
    iterations: formData.get("iterations"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  let candidates: Awaited<ReturnType<typeof getRotationCandidates>>;
  try {
    candidates = await getRotationCandidates(parsed.data.route);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  if (candidates.length === 0) {
    return { error: "No hay asesores disponibles para esta ruta.", totalCandidates: 0 };
  }

  const counts = new Map<string, number>();
  for (let i = 0; i < parsed.data.iterations; i++) {
    const picked = selectWeightedAdvisor(candidates);
    if (picked) counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
  }

  const results = candidates
    .map((advisor) => ({ id: advisor.id, nombre: advisor.nombre, count: counts.get(advisor.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return { results, totalCandidates: candidates.length };
}
