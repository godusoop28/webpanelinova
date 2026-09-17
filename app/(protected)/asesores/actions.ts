"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import {
  AdvisorInputSchema,
  PauseAdvisorInputSchema,
  SimulateDistributionInputSchema,
  type AdvisorInput,
} from "@/lib/schemas";
import { ROUTE_LABEL_TO_CODE } from "@/lib/advisors";
import { mexicoCityTomorrowAt, mexicoCityWallTimeToUtc } from "@/lib/timezone";
import { getDefaultCompanyId } from "@/lib/company";
import {
  createAdvisorFromInput,
  updateAdvisorFromInput,
  setAdvisorActiveState,
  pauseAdvisorUntil,
  resumeAdvisorNow,
} from "@/lib/services/advisor.service";
import { getRotationCandidatesForSimulation } from "@/lib/services/assignment.service";
import { pickWeightedLeastAssigned } from "@/lib/assignment-engine";

export interface AdvisorFormState {
  error?: string;
  success?: boolean;
}

function parseAdvisorFormData(formData: FormData): Record<string, unknown> {
  const limiteDiarioRaw = String(formData.get("limiteDiario") ?? "").trim();
  return {
    nombre: formData.get("nombre"),
    whatsapp: formData.get("whatsapp"),
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
  revalidatePath("/asesores");
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
    const companyId = await getDefaultCompanyId();
    await createAdvisorFromInput(companyId, parsed.data as AdvisorInput);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateAdvisors();
  return { success: true };
}

export async function updateAdvisorAction(
  id: string,
  _currentPausadoHasta: string | null,
  _prevState: AdvisorFormState,
  formData: FormData
): Promise<AdvisorFormState> {
  await requireRole("ADMIN", "DIRECCION");

  const parsed = AdvisorInputSchema.safeParse(parseAdvisorFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await updateAdvisorFromInput(id, parsed.data as AdvisorInput);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateAdvisors();
  return { success: true };
}

export async function toggleAdvisorAction(id: string, activo: boolean): Promise<void> {
  await requireRole("ADMIN", "DIRECCION");
  try {
    await setAdvisorActiveState(id, activo);
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

  let until: Date | "INDEFINITE";
  switch (parsed.data.mode) {
    case "1h":
      until = new Date(Date.now() + 60 * 60 * 1000);
      break;
    case "tomorrow_9am":
      until = mexicoCityTomorrowAt(9, 0);
      break;
    case "indefinite":
      until = "INDEFINITE";
      break;
    case "custom": {
      const [datePart, timePart] = parsed.data.customDateTime.split("T");
      const [year, month, day] = (datePart ?? "").split("-").map(Number);
      const [hour, minute] = (timePart ?? "").split(":").map(Number);
      if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
        return { error: "Fecha y hora de pausa inválidas." };
      }
      until = mexicoCityWallTimeToUtc(year, month, day, hour, minute);
      break;
    }
  }

  try {
    await pauseAdvisorUntil(id, until);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateAdvisors();
  return { success: true };
}

export async function resumeAdvisorAction(id: string): Promise<void> {
  await requireRole("ADMIN", "DIRECCION");
  try {
    await resumeAdvisorNow(id);
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

  let candidates: Awaited<ReturnType<typeof getRotationCandidatesForSimulation>>["candidates"];
  let todayCounts: Map<string, number>;
  try {
    const companyId = await getDefaultCompanyId();
    const routeCode = ROUTE_LABEL_TO_CODE[parsed.data.route];
    const result = await getRotationCandidatesForSimulation(companyId, routeCode);
    candidates = result.candidates;
    todayCounts = result.todayCounts;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  if (candidates.length === 0) {
    return { error: "No hay asesores disponibles para esta ruta.", totalCandidates: 0 };
  }

  const counts = new Map<string, number>();
  const simulatedCounts = new Map(todayCounts);
  for (let i = 0; i < parsed.data.iterations; i++) {
    const picked = pickWeightedLeastAssigned(candidates, simulatedCounts);
    if (picked) {
      counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
      simulatedCounts.set(picked.id, (simulatedCounts.get(picked.id) ?? 0) + 1);
    }
  }

  const results = candidates
    .map((advisor) => ({ id: advisor.id, nombre: advisor.name, count: counts.get(advisor.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return { results, totalCandidates: candidates.length };
}
