import { endOfDay, isWithinInterval, startOfDay, subDays } from "date-fns";

/**
 * Strips everything but digits so leads captured with different
 * formatting (spaces, dashes, "+52", parentheses) can be deduplicated
 * and compared reliably.
 */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

export type DateRangePreset =
  | "today"
  | "this_week"
  | "last_week"
  | "last_30_days"
  | "this_month"
  | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = (day + 6) % 7; // days since Monday
  const result = new Date(date);
  result.setDate(date.getDate() - diff);
  return startOfDay(result);
}

export function resolveDateRange(
  preset: DateRangePreset,
  custom?: { from: string; to: string }
): DateRange {
  const now = new Date();

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "this_week": {
      const from = startOfWeekMonday(now);
      return { from, to: endOfDay(now) };
    }
    case "last_week": {
      const thisWeekStart = startOfWeekMonday(now);
      const from = subDays(thisWeekStart, 7);
      const to = endOfDay(subDays(thisWeekStart, 1));
      return { from, to };
    }
    case "last_30_days":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "this_month": {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      return { from, to: endOfDay(now) };
    }
    case "custom": {
      if (!custom) {
        throw new Error("Rango personalizado requiere fechas 'from' y 'to'.");
      }
      return {
        from: startOfDay(new Date(custom.from)),
        to: endOfDay(new Date(custom.to)),
      };
    }
    default:
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
  }
}

/**
 * Mirrors a range immediately before it (same length) so dashboard cards
 * can show a period-over-period comparison.
 */
export function previousPeriod(range: DateRange): DateRange {
  const lengthMs = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - lengthMs - 1),
    to: new Date(range.from.getTime() - 1),
  };
}

export function isDateInRange(date: Date | null, range: DateRange): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return isWithinInterval(date, { start: range.from, end: range.to });
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

export interface LeadLike {
  fechaHora: string;
  telefono: string;
  tipoInteres: string;
  origen: string;
  estadoEasyBroker: string;
  tipoAsignacion: string;
  estadoEnvioAsesor: string;
}

export interface LeadMetrics {
  personasUnicas: number;
  totalSolicitudes: number;
  leadsCampana: number;
  leadsPropiedad: number;
  leadsExploracion: number;
  asignacionesExclusivas: number;
  asignacionesRuleta: number;
  notificacionesPendientes: number;
  notificacionesConError: number;
}

function parseLeadDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeLeadMetrics(
  leads: LeadLike[],
  range: DateRange
): LeadMetrics {
  const inRange = leads.filter((lead) => isDateInRange(parseLeadDate(lead.fechaHora), range));

  const uniquePhones = new Set(
    inRange.map((lead) => normalizePhone(lead.telefono)).filter(Boolean)
  );

  const norm = (value: string) => value.trim().toLowerCase();

  return {
    personasUnicas: uniquePhones.size,
    totalSolicitudes: inRange.length,
    leadsCampana: inRange.filter((l) => norm(l.origen).includes("campa")).length,
    leadsPropiedad: inRange.filter((l) => norm(l.tipoInteres).includes("propiedad")).length,
    leadsExploracion: inRange.filter((l) => norm(l.tipoInteres).includes("explora")).length,
    asignacionesExclusivas: inRange.filter((l) => norm(l.tipoAsignacion).includes("exclus")).length,
    asignacionesRuleta: inRange.filter((l) => norm(l.tipoAsignacion).includes("ruleta")).length,
    notificacionesPendientes: inRange.filter((l) => norm(l.estadoEnvioAsesor).includes("pendient")).length,
    notificacionesConError: inRange.filter((l) => norm(l.estadoEnvioAsesor).includes("error")).length,
  };
}
