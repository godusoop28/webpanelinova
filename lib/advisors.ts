/**
 * Advisor domain constants and pure helpers shared by the assignment
 * engine and the /asesores UI. No "server-only" here on purpose: this
 * file has to be importable from Client Components (forms, badges) as
 * well as from server code.
 */
import type { Advisor as DbAdvisor } from "@prisma/client";
import type { AdvisorView } from "@/lib/types";

// ---------------------------------------------------------------------------
// Rutas de leads
// ---------------------------------------------------------------------------

/** Rutas por las que un lead puede pedir asesor. Un cambio aquí lo recogen UI, validación y motor de asignación a la vez. */
export const LEAD_ROUTES = [
  "Vi una propiedad",
  "Explorar opciones",
  "Campaña propiedad",
  "Timeout",
] as const;

export type AdvisorRoute = (typeof LEAD_ROUTES)[number];

/** Etiqueta en español (UI) -> código corto que usa el motor de asignación. */
export const ROUTE_LABEL_TO_CODE: Record<AdvisorRoute, "PROPERTY" | "EXPLORE" | "CAMPAIGN" | "TIMEOUT"> = {
  "Vi una propiedad": "PROPERTY",
  "Explorar opciones": "EXPLORE",
  "Campaña propiedad": "CAMPAIGN",
  Timeout: "TIMEOUT",
};

// ---------------------------------------------------------------------------
// Prioridad / peso
// ---------------------------------------------------------------------------

export const DEFAULT_ADVISOR_WEIGHT = 5;

export const ADVISOR_PRIORITY_OPTIONS = [
  { label: "Muy baja", weight: 1 },
  { label: "Baja", weight: 3 },
  { label: "Normal", weight: 5 },
  { label: "Alta", weight: 8 },
  { label: "Muy alta", weight: 10 },
] as const;

export function priorityLabelForWeight(weight: number): string {
  const match = ADVISOR_PRIORITY_OPTIONS.find((option) => option.weight === weight);
  return match ? match.label : `Personalizada (${weight})`;
}

// ---------------------------------------------------------------------------
// Pausa
// ---------------------------------------------------------------------------

/** Valor de pausadoHasta que representa "pausado indefinidamente". */
export const PAUSE_INDEFINITE = "INDEFINIDO";

export function isPaused(advisor: Pick<AdvisorView, "pausadoHasta">, now: Date): boolean {
  if (!advisor.pausadoHasta) return false;
  if (advisor.pausadoHasta === PAUSE_INDEFINITE) return true;
  const until = new Date(advisor.pausadoHasta);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// Adaptador Postgres -> vista de UI
// ---------------------------------------------------------------------------

type AllowedRouteFlags = Pick<DbAdvisor, "allowedProperty" | "allowedExplore" | "allowedCampaign" | "allowedTimeout">;

const ROUTE_LABEL_TO_ALLOWED_FIELD: Record<(typeof LEAD_ROUTES)[number], keyof AllowedRouteFlags> = {
  "Vi una propiedad": "allowedProperty",
  "Explorar opciones": "allowedExplore",
  "Campaña propiedad": "allowedCampaign",
  Timeout: "allowedTimeout",
};

/** [] significa "todas las rutas". */
export function dbAdvisorAllowedRoutes(advisor: AllowedRouteFlags): string[] {
  const allowed = LEAD_ROUTES.filter((route) => advisor[ROUTE_LABEL_TO_ALLOWED_FIELD[route]]);
  return allowed.length === LEAD_ROUTES.length ? [] : allowed;
}

export function routeLabelsToAllowedFlags(routes: string[]): AllowedRouteFlags {
  const set = new Set(routes.length === 0 ? LEAD_ROUTES : routes);
  return {
    allowedProperty: set.has("Vi una propiedad"),
    allowedExplore: set.has("Explorar opciones"),
    allowedCampaign: set.has("Campaña propiedad"),
    allowedTimeout: set.has("Timeout"),
  };
}

/**
 * Advisor.pausedUntil en Postgres es un DateTime plano, sin un valor
 * centinela para "indefinido". Se representa como una fecha muy lejana en
 * vez de agregar una columna extra al schema — año 2999 nunca se confunde
 * con una pausa real.
 */
const DB_INDEFINITE_PAUSE_YEAR = 2999;

export function dbIndefinitePauseDate(): Date {
  return new Date(Date.UTC(DB_INDEFINITE_PAUSE_YEAR, 0, 1));
}

export function isDbIndefinitePause(pausedUntil: Date | null): boolean {
  return pausedUntil !== null && pausedUntil.getUTCFullYear() >= DB_INDEFINITE_PAUSE_YEAR;
}

export function dbAdvisorToView(advisor: DbAdvisor): AdvisorView {
  return {
    id: advisor.id,
    nombre: advisor.name,
    whatsapp: advisor.phone,
    activo: advisor.active,
    emailEasyBroker: advisor.easyBrokerEmail ?? "",
    manyChatId: advisor.manyChatSubscriberId ?? "",
    peso: advisor.weight,
    rutasPermitidas: dbAdvisorAllowedRoutes(advisor),
    pausadoHasta: advisor.pausedUntil
      ? isDbIndefinitePause(advisor.pausedUntil)
        ? PAUSE_INDEFINITE
        : advisor.pausedUntil.toISOString()
      : null,
    limiteDiario: advisor.dailyLimit,
    observaciones: advisor.notes ?? "",
  };
}
