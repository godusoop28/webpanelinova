/**
 * Rondas por horario de asesores. Puro (sin Prisma ni "server-only"):
 * lo usan el motor de asignación, el simulador y el panel.
 *
 * Regla: mientras una ronda está activa, los leads que van a la ruleta
 * ponderada (WEIGHTED_ROTATION) se reparten SOLO entre los asesores en
 * ronda que además son elegibles (activos, sin pausa, con la ruta
 * permitida y sin rebasar su límite diario). Si ninguno puede recibirlo,
 * la ruleta normal sigue con todos los elegibles: nunca se pierde un lead.
 * La asignación directa (asesor dueño de la propiedad) no cambia.
 */

export const ROUND_TIME_ZONE = "America/Mexico_City";

/** ISO: 1 = lunes … 7 = domingo. */
export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Lun", long: "Lunes" },
  { value: 2, short: "Mar", long: "Martes" },
  { value: 3, short: "Mié", long: "Miércoles" },
  { value: 4, short: "Jue", long: "Jueves" },
  { value: 5, short: "Vie", long: "Viernes" },
  { value: 6, short: "Sáb", long: "Sábado" },
  { value: 7, short: "Dom", long: "Domingo" },
];

export interface AdvisorRoundSchedule {
  advisorId: string;
  /** Días ISO (1-7) en que INICIA la ronda. */
  weekdays: number[];
  /** Minuto del día de inicio, 0-1439. */
  startMinute: number;
  /** Minuto del día de fin, 1-1440. Si es <= inicio, la ronda cruza la medianoche. */
  endMinute: number;
  active: boolean;
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ROUND_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Día ISO y minuto del día en Ciudad de México. */
export function mexicoCityClock(now: Date): { weekday: number; minute: number } {
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  return { weekday: WEEKDAY_INDEX[parts.weekday] ?? 1, minute: hour * 60 + Number(parts.minute) };
}

/** ¿La ronda cubre este instante? Una ronda nocturna (22:00–02:00) pertenece al día en que empieza. */
export function isRoundActiveAt(round: AdvisorRoundSchedule, now: Date): boolean {
  if (!round.active || round.weekdays.length === 0) return false;
  const { weekday, minute } = mexicoCityClock(now);
  const { startMinute, endMinute } = round;
  if (endMinute > startMinute) {
    return round.weekdays.includes(weekday) && minute >= startMinute && minute < endMinute;
  }
  // Cruza la medianoche: tramo de la noche del día de inicio o madrugada del día siguiente.
  const previousDay = weekday === 1 ? 7 : weekday - 1;
  return (round.weekdays.includes(weekday) && minute >= startMinute) || (round.weekdays.includes(previousDay) && minute < endMinute);
}

/** Asesores con al menos una ronda activa en este instante. */
export function advisorsOnRound(rounds: AdvisorRoundSchedule[], now: Date): Set<string> {
  return new Set(rounds.filter((round) => isRoundActiveAt(round, now)).map((round) => round.advisorId));
}

/**
 * Reduce el grupo de candidatos de la ruleta a los asesores en ronda que
 * todavía tienen cupo. Devuelve el grupo original si nadie en ronda puede
 * recibir el lead.
 */
export function applyRounds<T extends { id: string; dailyLimit: number | null }>(
  candidates: T[],
  todayCounts: Map<string, number>,
  onRound: Set<string>
): { pool: T[]; roundApplied: boolean } {
  if (onRound.size === 0) return { pool: candidates, roundApplied: false };
  const available = candidates.filter((advisor) => {
    if (!onRound.has(advisor.id)) return false;
    const count = todayCounts.get(advisor.id) ?? 0;
    return advisor.dailyLimit === null || count < advisor.dailyLimit;
  });
  return available.length > 0 ? { pool: available, roundApplied: true } : { pool: candidates, roundApplied: false };
}

export function formatMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, minute));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → minuto del día. "24:00" se acepta como fin del día. */
export function parseTimeToMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (m > 59 || h > 24 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

export function describeWeekdays(weekdays: number[]): string {
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Todos los días";
  if (sorted.join(",") === "1,2,3,4,5") return "Lunes a viernes";
  if (sorted.join(",") === "6,7") return "Fines de semana";
  return sorted.map((day) => WEEKDAYS.find((w) => w.value === day)?.short ?? String(day)).join(", ");
}

export function describeRound(round: Pick<AdvisorRoundSchedule, "weekdays" | "startMinute" | "endMinute">): string {
  const overnight = round.endMinute <= round.startMinute;
  return `${describeWeekdays(round.weekdays)} · ${formatMinute(round.startMinute)}–${formatMinute(round.endMinute)}${overnight ? " (cruza medianoche)" : ""}`;
}
