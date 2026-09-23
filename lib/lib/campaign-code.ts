// Matches EasyBroker's Make scenario pattern (?<codigo>EB-[A-Za-z0-9-]+) — no
// named group here since tsconfig targets ES2017 (Fase 42: keep the diff
// minimal, don't bump the project-wide build target for this). Pure/no
// "server-only" so it's unit-testable, same split as lib/assignment-engine.ts.
const CAMPAIGN_PROPERTY_CODE_PATTERN = /EB-[A-Za-z0-9-]+/;

/**
 * Pulls an EasyBroker public_id out of free text like "Me interesa
 * EB-ABC123" or "Vi esta propiedad EB-12345" — `datos_propiedad` from a
 * campaign flow is never guaranteed to contain only the id.
 */
export function extractCampaignPropertyCode(text: string): string | null {
  return CAMPAIGN_PROPERTY_CODE_PATTERN.exec(text)?.[0] ?? null;
}
