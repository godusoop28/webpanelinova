/**
 * Single source of truth for "what period is selected" across the
 * dashboard, /reportes, and the PDF/CSV exports. Every screen resolves its
 * period through this module so they can never disagree on what "hoy" or
 * "este mes" means — that was the point of extracting it (see AGENTS.md
 * task: "Dashboard y Reportes deben coincidir").
 *
 * All wall-clock math happens in America/Mexico_City via lib/timezone.ts's
 * Intl-based helpers, never the server's local timezone — Vercel runs
 * serverless functions in UTC, so `new Date().getDate()` or
 * `new Date("2026-09-01")` (parsed as UTC midnight) silently shift a
 * "today" or custom-range boundary by up to 6 hours in production, even
 * though the same code looks correct on a developer's MX-timezone machine.
 * That mismatch was the root cause of the custom-range bug this module
 * fixes — see the module-level test file for the regression coverage.
 */
import { mexicoCityDateKey, mexicoCityWallTimeToUtc } from "@/lib/timezone";

export const DATE_RANGE_PRESETS = [
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "custom",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Hoy",
  this_week: "Esta semana",
  last_week: "Semana anterior",
  this_month: "Este mes",
  last_month: "Mes anterior",
  custom: "Rango personalizado",
};

export interface CustomRangeInput {
  from: string;
  to: string;
}

export interface ResolvedDateRange {
  preset: DateRangePreset;
  /** Inclusive start instant (UTC), first millisecond of the period in Mexico City wall time. */
  startDate: Date;
  /** Inclusive end instant (UTC), last millisecond of the period in Mexico City wall time. */
  endDate: Date;
  /** Human label, e.g. "Hoy" or "01/09/2026 — 19/09/2026". */
  label: string;
}

export class InvalidDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDateRangeError";
  }
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDateParts(value: string): { year: number; month: number; day: number } {
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) {
    throw new InvalidDateRangeError(`Fecha inválida: "${value}". Usa el formato AAAA-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Reject e.g. 2026-02-31 instead of silently rolling into March.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new InvalidDateRangeError(`Fecha inválida: "${value}".`);
  }
  return { year, month, day };
}

/** Start-of-day (00:00:00.000) in Mexico City for the given Y/M/D, as a UTC instant. */
function mexicoCityStartOfDay(year: number, month: number, day: number): Date {
  return mexicoCityWallTimeToUtc(year, month, day, 0, 0);
}

/** End-of-day (23:59:59.999) in Mexico City for the given Y/M/D, as a UTC instant. */
function mexicoCityEndOfDay(year: number, month: number, day: number): Date {
  const nextDayStart = mexicoCityWallTimeToUtc(year, month, day + 1, 0, 0);
  return new Date(nextDayStart.getTime() - 1);
}

function mexicoCityTodayParts(reference: Date): { year: number; month: number; day: number } {
  const key = mexicoCityDateKey(reference);
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function formatLabelDate(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** Monday of the Mexico-City week containing `reference`, as Y/M/D parts. */
function mondayOfWeek(reference: Date): { year: number; month: number; day: number } {
  const { year, month, day } = mexicoCityTodayParts(reference);
  // Mexico has no DST since 2022, so a plain UTC-anchored Date is safe here
  // purely as a calendar calculator (day-of-week + day arithmetic), never
  // as an instant — mexicoCityWallTimeToUtc does the real conversion.
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const isoDayOfWeek = asUtc.getUTCDay() === 0 ? 7 : asUtc.getUTCDay(); // Mon=1..Sun=7
  const mondayUtc = new Date(Date.UTC(year, month - 1, day - (isoDayOfWeek - 1)));
  return { year: mondayUtc.getUTCFullYear(), month: mondayUtc.getUTCMonth() + 1, day: mondayUtc.getUTCDate() };
}

/**
 * Resolves a preset (or a custom `from`/`to`) into concrete UTC instants.
 *
 * Convention for "this_week" / "this_month": Monday-of-week (resp. day 1)
 * 00:00:00 through the current instant — a running, not-yet-complete
 * period, so today's leads always show up. "last_week" / "last_month" are
 * always full, closed calendar periods (Mon-Sun, 1st-to-last-day).
 */
export function resolveDateRange(preset: DateRangePreset, custom?: CustomRangeInput): ResolvedDateRange {
  const now = new Date();

  switch (preset) {
    case "today": {
      const { year, month, day } = mexicoCityTodayParts(now);
      return {
        preset,
        startDate: mexicoCityStartOfDay(year, month, day),
        endDate: mexicoCityEndOfDay(year, month, day),
        label: DATE_RANGE_PRESET_LABELS.today,
      };
    }
    case "this_week": {
      const monday = mondayOfWeek(now);
      return {
        preset,
        startDate: mexicoCityStartOfDay(monday.year, monday.month, monday.day),
        endDate: now,
        label: DATE_RANGE_PRESET_LABELS.this_week,
      };
    }
    case "last_week": {
      const thisMonday = mondayOfWeek(now);
      const thisMondayUtc = new Date(Date.UTC(thisMonday.year, thisMonday.month - 1, thisMonday.day));
      const lastMonday = new Date(thisMondayUtc.getTime() - 7 * 86400000);
      const lastSunday = new Date(thisMondayUtc.getTime() - 1 * 86400000);
      const lm = { year: lastMonday.getUTCFullYear(), month: lastMonday.getUTCMonth() + 1, day: lastMonday.getUTCDate() };
      const ls = { year: lastSunday.getUTCFullYear(), month: lastSunday.getUTCMonth() + 1, day: lastSunday.getUTCDate() };
      return {
        preset,
        startDate: mexicoCityStartOfDay(lm.year, lm.month, lm.day),
        endDate: mexicoCityEndOfDay(ls.year, ls.month, ls.day),
        label: DATE_RANGE_PRESET_LABELS.last_week,
      };
    }
    case "this_month": {
      const { year, month } = mexicoCityTodayParts(now);
      return {
        preset,
        startDate: mexicoCityStartOfDay(year, month, 1),
        endDate: now,
        label: DATE_RANGE_PRESET_LABELS.this_month,
      };
    }
    case "last_month": {
      const { year, month } = mexicoCityTodayParts(now);
      // month is 1-indexed; month-1-1 (0-indexed, one back) is last month, day 0 = last day of that month.
      const prevMonthFirst = new Date(Date.UTC(year, month - 2, 1));
      const prevMonthLast = new Date(Date.UTC(year, month - 1, 0));
      return {
        preset,
        startDate: mexicoCityStartOfDay(prevMonthFirst.getUTCFullYear(), prevMonthFirst.getUTCMonth() + 1, 1),
        endDate: mexicoCityEndOfDay(
          prevMonthLast.getUTCFullYear(),
          prevMonthLast.getUTCMonth() + 1,
          prevMonthLast.getUTCDate()
        ),
        label: DATE_RANGE_PRESET_LABELS.last_month,
      };
    }
    case "custom": {
      if (!custom || !custom.from || !custom.to) {
        throw new InvalidDateRangeError("Selecciona una fecha inicial y una fecha final.");
      }
      const from = parseIsoDateParts(custom.from);
      const to = parseIsoDateParts(custom.to);
      const startDate = mexicoCityStartOfDay(from.year, from.month, from.day);
      const endDate = mexicoCityEndOfDay(to.year, to.month, to.day);
      if (startDate.getTime() > endDate.getTime()) {
        throw new InvalidDateRangeError("La fecha inicial debe ser anterior o igual a la fecha final.");
      }
      return {
        preset,
        startDate,
        endDate,
        label: `${formatLabelDate(from.year, from.month, from.day)} — ${formatLabelDate(to.year, to.month, to.day)}`,
      };
    }
    default: {
      // Exhaustiveness guard: DATE_RANGE_PRESETS/DateRangePreset only ever
      // produce values handled above, so this can only be reached by an
      // invalid searchParams value from the URL.
      throw new InvalidDateRangeError(`Periodo desconocido: "${preset}".`);
    }
  }
}

/** Mirrors `range` immediately before it (same duration) for period-over-period comparisons. */
export function previousDateRange(range: Pick<ResolvedDateRange, "startDate" | "endDate">): {
  startDate: Date;
  endDate: Date;
} {
  const lengthMs = range.endDate.getTime() - range.startDate.getTime();
  return {
    startDate: new Date(range.startDate.getTime() - lengthMs - 1),
    endDate: new Date(range.startDate.getTime() - 1),
  };
}

/** Parses `?range=&from=&to=` search params into a preset + optional custom input, defaulting to "today". */
export function presetFromSearchParams(params: {
  range?: string;
  from?: string;
  to?: string;
}): { preset: DateRangePreset; custom?: CustomRangeInput } {
  const preset = (DATE_RANGE_PRESETS as readonly string[]).includes(params.range ?? "")
    ? (params.range as DateRangePreset)
    : "today";
  if (preset === "custom" && params.from && params.to) {
    return { preset, custom: { from: params.from, to: params.to } };
  }
  return { preset };
}
