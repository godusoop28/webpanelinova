import "server-only";
import { prisma } from "@/lib/db";
import type { AdvisorRoundSchedule } from "@/lib/advisor-rounds";

/**
 * Rondas activas de la empresa para el motor de asignación. Nunca lanza:
 * si la consulta falla (p. ej. la migración aún no se aplicó), devuelve
 * [] y la ruleta funciona exactamente como antes.
 */
export async function loadRoundSchedules(companyId: string): Promise<AdvisorRoundSchedule[]> {
  try {
    const rows = await prisma.advisorRound.findMany({
      where: { companyId, active: true, advisor: { active: true } },
      select: { advisorId: true, weekdays: true, startMinute: true, endMinute: true, active: true },
    });
    return rows;
  } catch (error) {
    console.error("[advisor-rounds] No se pudieron leer las rondas; se usa la ruleta normal:", error instanceof Error ? error.message : error);
    return [];
  }
}

export type RoundsListing =
  | { ok: true; rounds: Awaited<ReturnType<typeof listRoundsQuery>> }
  | { ok: false; error: string };

function listRoundsQuery(companyId: string) {
  return prisma.advisorRound.findMany({
    where: { companyId },
    orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }],
    include: { advisor: { select: { id: true, name: true, active: true, pausedUntil: true } } },
  });
}

/** Para el panel: distingue "sin rondas" de "la tabla no existe todavía". */
export async function listRounds(companyId: string): Promise<RoundsListing> {
  try {
    return { ok: true, rounds: await listRoundsQuery(companyId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingTable = /advisor_rounds|does not exist|P2021/i.test(message);
    return {
      ok: false,
      error: missingTable
        ? "Falta aplicar la migración de rondas en la base de datos (npx prisma migrate deploy)."
        : `No se pudieron cargar las rondas: ${message}`,
    };
  }
}

export interface RoundInput {
  advisorId: string;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  note?: string | null;
}

async function assertAdvisor(companyId: string, advisorId: string) {
  const advisor = await prisma.advisor.findFirst({ where: { id: advisorId, companyId }, select: { id: true } });
  if (!advisor) throw new Error("Asesor no encontrado.");
}

export async function createRound(companyId: string, input: RoundInput, by: string) {
  await assertAdvisor(companyId, input.advisorId);
  return prisma.advisorRound.create({
    data: {
      companyId,
      advisorId: input.advisorId,
      weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b),
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      note: input.note?.trim() || null,
      createdBy: by,
    },
  });
}

export async function setRoundActive(companyId: string, roundId: string, active: boolean) {
  const round = await prisma.advisorRound.findFirst({ where: { id: roundId, companyId } });
  if (!round) throw new Error("Ronda no encontrada.");
  return prisma.advisorRound.update({ where: { id: round.id }, data: { active } });
}

export async function deleteRound(companyId: string, roundId: string) {
  const round = await prisma.advisorRound.findFirst({ where: { id: roundId, companyId } });
  if (!round) throw new Error("Ronda no encontrada.");
  await prisma.advisorRound.delete({ where: { id: round.id } });
}
