/**
 * Advisor domain constants and pure helpers shared by the Google Sheets
 * mapping layer, the assignment engine, and the /asesores UI. No
 * "server-only" here on purpose: this file has to be importable from
 * Client Components (forms, badges) as well as from server code.
 */
import type { Advisor as DbAdvisor } from "@prisma/client";
import type { AdvisorRow, LeadRow } from "@/lib/google-sheets";
import { normalizePhone } from "@/lib/metrics";
import { isSameMexicoCityDay } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Rutas de leads
// ---------------------------------------------------------------------------

/**
 * Rutas conocidas por las que Make (o el motor nuevo) puede pedir un
 * asesor. Centralizada aquí para que agregar una ruta nueva sea un solo
 * cambio (UI, validación y motor de asignación la recogen
 * automáticamente). "Timeout" no existía como ruta separada en la hoja de
 * Sheets original (Make la trataba igual que "Explorar opciones"); se
 * agrega para que el Advisor de Postgres (que sí trae allowedTimeout como
 * campo propio, ver prisma/schema.prisma) pueda distinguirla.
 */
export const LEAD_ROUTES = [
  "Vi una propiedad",
  "Explorar opciones",
  "Campaña propiedad",
  "Timeout",
] as const;

export type AdvisorRoute = (typeof LEAD_ROUTES)[number];

/** "" (columna vacía) → participa en todas las rutas, para filas antiguas. */
export function parseRoutesFromSheet(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean);
}

export function routesToSheetValue(routes: string[]): string {
  return routes.join(",");
}

/** Un array vacío significa "todas las rutas" (compatibilidad con filas A:H). */
export function canReceiveRoute(advisor: Pick<AdvisorRow, "rutasPermitidas">, route: string): boolean {
  return advisor.rutasPermitidas.length === 0 || advisor.rutasPermitidas.includes(route);
}

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
// Rol / tipo de asignación (quién participa en la ruleta)
// ---------------------------------------------------------------------------

/**
 * Únicamente estos roles participan en la distribución ponderada. Filas con
 * rol "Gerente", "Coordinadora", "Comodín", etc. se conservan en el panel
 * pero el motor de asignación las ignora. Ajustar esta lista si el negocio
 * agrega roles nuevos que sí deban rotar.
 */
export const ROTATION_ELIGIBLE_ROLES = ["Asesor"];

/**
 * "Tipo de asignación" que excluye a un asesor de la ruleta ponderada:
 * EasyBroker sigue decidiendo esos leads mediante asesor exclusivo. Se
 * detecta por substring (coincide con el criterio ya usado en
 * lib/metrics.ts para clasificar leads como "exclusivos").
 */
export function isExclusiveAssignment(tipoAsignacion: string): boolean {
  return tipoAsignacion.trim().toLowerCase().includes("exclus");
}

export function isEligibleForRotation(advisor: AdvisorRow): boolean {
  return (
    advisor.activo &&
    ROTATION_ELIGIBLE_ROLES.includes(advisor.rol.trim()) &&
    !isExclusiveAssignment(advisor.tipoAsignacion)
  );
}

/**
 * The Postgres Advisor model has no `rol` field (Fase 2 of the migration
 * spec deliberately left it out) — a manager/admin/wildcard row from the
 * legacy sheet (rol "Gerente"/"Administrador"/"Comodín", or tipoAsignacion
 * "Exclusivo") is represented in the new schema as weight 0 instead, since
 * lib/repositories/assignment.repository.ts's eligibility query already
 * requires weight > 0. Used by the Sheets/Excel importers so those rows
 * keep their real easyBrokerEmail (for direct-match lookups) without ever
 * being pickable by the weighted rotation.
 */
export function effectiveImportWeight(row: Pick<AdvisorRow, "rol" | "tipoAsignacion" | "peso">): number {
  const rotationEligible =
    ROTATION_ELIGIBLE_ROLES.includes(row.rol.trim()) && !isExclusiveAssignment(row.tipoAsignacion);
  return rotationEligible ? row.peso : 0;
}

// ---------------------------------------------------------------------------
// Pausa
// ---------------------------------------------------------------------------

/** Valor almacenado en la columna K para una pausa indefinida. */
export const PAUSE_INDEFINITE = "INDEFINIDO";

export function isPaused(advisor: Pick<AdvisorRow, "pausadoHasta">, now: Date): boolean {
  if (!advisor.pausadoHasta) return false;
  if (advisor.pausadoHasta === PAUSE_INDEFINITE) return true;
  const until = new Date(advisor.pausadoHasta);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// Límite diario (agrupando leads existentes por asesor)
// ---------------------------------------------------------------------------

export interface AdvisorLeadCounts {
  byId: Map<string, number>;
  byWhatsapp: Map<string, number>;
  byNombre: Map<string, number>;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Agrupa los leads del día (hora de México) por asesor asignado, en una
 * sola pasada. Prioriza "ID asesor asignado"; usa WhatsApp y luego nombre
 * como fallback para leads antiguos que no tenían el ID.
 */
export function buildTodayLeadCounts(leads: LeadRow[], now: Date): AdvisorLeadCounts {
  const byId = new Map<string, number>();
  const byWhatsapp = new Map<string, number>();
  const byNombre = new Map<string, number>();

  for (const lead of leads) {
    const leadDate = new Date(lead.fechaAsignacion || lead.fechaHora);
    if (Number.isNaN(leadDate.getTime()) || !isSameMexicoCityDay(leadDate, now)) continue;

    if (lead.idAsesorAsignado) {
      increment(byId, lead.idAsesorAsignado);
    } else if (lead.whatsappAsesorAsignado) {
      increment(byWhatsapp, normalizePhone(lead.whatsappAsesorAsignado));
    } else if (lead.asesorAsignado) {
      increment(byNombre, lead.asesorAsignado.trim().toLowerCase());
    }
  }

  return { byId, byWhatsapp, byNombre };
}

export function countTodayLeadsForAdvisor(advisor: AdvisorRow, counts: AdvisorLeadCounts): number {
  return (
    counts.byId.get(advisor.id) ??
    counts.byWhatsapp.get(normalizePhone(advisor.whatsapp)) ??
    counts.byNombre.get(advisor.nombre.trim().toLowerCase()) ??
    0
  );
}

export function hasReachedDailyLimit(advisor: AdvisorRow, counts: AdvisorLeadCounts): boolean {
  if (advisor.limiteDiario === null) return false;
  return countTodayLeadsForAdvisor(advisor, counts) >= advisor.limiteDiario;
}

// ---------------------------------------------------------------------------
// Adaptador Postgres <-> vista legada (Fase 64: la UI de /asesores sigue
// consumiendo la forma AdvisorRow sin saber que ahora puede venir de
// Prisma en vez de Sheets). Solo tipos de @prisma/client (import type, se
// borra en compilación) — este archivo debe seguir siendo importable desde
// Client Components.
// ---------------------------------------------------------------------------

type AllowedRouteFlags = Pick<DbAdvisor, "allowedProperty" | "allowedExplore" | "allowedCampaign" | "allowedTimeout">;

const ROUTE_LABEL_TO_ALLOWED_FIELD: Record<(typeof LEAD_ROUTES)[number], keyof AllowedRouteFlags> = {
  "Vi una propiedad": "allowedProperty",
  "Explorar opciones": "allowedExplore",
  "Campaña propiedad": "allowedCampaign",
  Timeout: "allowedTimeout",
};

/** [] significa "todas las rutas" en la convención legada, igual que rutasPermitidas vacío en Sheets. */
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
 * centinela para "indefinido" como la columna K de Sheets (PAUSE_INDEFINIDO).
 * Se representa como una fecha muy lejana en vez de agregar nullable+enum
 * extra al schema — año 2999 nunca se confunde con una pausa real.
 */
const DB_INDEFINITE_PAUSE_YEAR = 2999;

export function dbIndefinitePauseDate(): Date {
  return new Date(Date.UTC(DB_INDEFINITE_PAUSE_YEAR, 0, 1));
}

export function isDbIndefinitePause(pausedUntil: Date | null): boolean {
  return pausedUntil !== null && pausedUntil.getUTCFullYear() >= DB_INDEFINITE_PAUSE_YEAR;
}

/** Adapta un Advisor de Postgres a la forma AdvisorRow que ya consumen advisor-row.tsx / advisor-form.tsx. */
export function dbAdvisorToView(advisor: DbAdvisor): AdvisorRow {
  return {
    rowNumber: 0, // no aplica en modo DB; las acciones usan advisor.id (ver app/(protected)/asesores/actions.ts)
    id: advisor.id,
    nombre: advisor.name,
    whatsapp: advisor.phone,
    rol: "Asesor",
    activo: advisor.active,
    tipoAsignacion: "Rotación",
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
