import type { LeadInterestType } from "@prisma/client";
import type { AssignmentRoute } from "@/lib/assignment-engine";
import type { AdvisorRoute } from "@/lib/advisors";

/**
 * Central normalization for ManyChat's free-text `interes_cliente` into our
 * four controlled routes. Pure and DB-agnostic on purpose (same split as
 * lib/assignment-engine.ts) so it's unit-testable and reusable by both the
 * real webhook and the /testing simulator without duplicating the rules.
 *
 * Substring matching, not exact comparison: ManyChat's wording has drifted
 * before (accented vs. unaccented Spanish, English literals, "Asesoría" as
 * a synonym for "Explorar") and a strict enum here would silently misroute
 * a lead instead of failing loudly. "Sin respuesta" and "Timeout" are
 * intentionally folded into the same TIMEOUT result — they must land in the
 * same assignment route (the Timeout advisor pool), not two different ones.
 */
export interface InterestClassification {
  interestType: LeadInterestType;
  routeLabel: AdvisorRoute;
  assignmentRoute: AssignmentRoute;
}

const RULES: { test: (normalized: string) => boolean; result: InterestClassification }[] = [
  {
    // Campaña, Campana, campaign, CAMPAIGN — checked before PROPERTY: the
    // route's own Spanish label is "Campaña propiedad", which also contains
    // "propiedad", so campaign has to win that overlap.
    test: (n) => n.includes("campa"),
    result: { interestType: "CAMPAIGN", routeLabel: "Campaña propiedad", assignmentRoute: "CAMPAIGN" },
  },
  {
    // Propiedad, Vi una propiedad, PROPERTY
    test: (n) => n.includes("propiedad") || n.includes("property"),
    result: { interestType: "PROPERTY", routeLabel: "Vi una propiedad", assignmentRoute: "PROPERTY" },
  },
  {
    // Sin respuesta, Timeout, TIMEOUT
    test: (n) => n.includes("timeout") || n.includes("sin respuesta") || n.includes("sin_respuesta"),
    result: { interestType: "TIMEOUT", routeLabel: "Timeout", assignmentRoute: "TIMEOUT" },
  },
  {
    // Explorar, Explorar opciones, Asesoría, Asesoria, EXPLORE
    test: (n) => n.includes("explor") || n.includes("asesor"),
    result: { interestType: "EXPLORE", routeLabel: "Explorar opciones", assignmentRoute: "EXPLORE" },
  },
];

const FALLBACK: InterestClassification = {
  interestType: "OTHER",
  routeLabel: "Explorar opciones",
  assignmentRoute: "EXPLORE",
};

export function classifyInterest(raw: string): InterestClassification {
  const normalized = raw.trim().toLowerCase();
  for (const rule of RULES) {
    if (rule.test(normalized)) return rule.result;
  }
  return FALLBACK;
}
