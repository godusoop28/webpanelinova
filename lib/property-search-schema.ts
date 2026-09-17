import { z } from "zod";

/**
 * Pure validation/verification core of the deep property search (Fase 24).
 * No "server-only" — split out from lib/services/property-search.service.ts
 * so the "never trust an AI-invented id" logic is unit-testable without
 * hitting EasyBroker or OpenAI.
 */
export const AiPropertySearchResponseSchema = z.object({
  resultado: z.string(),
  opciones: z.array(z.object({ id: z.string().trim().min(1), titulo: z.string().trim() })).max(3),
});

export type AiPropertySearchResponse = z.infer<typeof AiPropertySearchResponseSchema>;

export interface PropertySearchOption {
  id: string;
  titulo: string;
  url?: string;
}

/**
 * Keeps only AI-suggested ids that actually exist in the candidate set
 * fetched from EasyBroker, deduplicated, capped at 3 — the AI's `titulo`
 * is discarded in favor of the candidate's real title/url.
 */
export function verifyAiOptions(
  aiOptions: { id: string }[],
  candidatesById: Map<string, { title: string; public_url?: string }>
): PropertySearchOption[] {
  const uniqueIds = [...new Set(aiOptions.map((option) => option.id))];
  const verifiedIds = uniqueIds.filter((id) => candidatesById.has(id)).slice(0, 3);
  return verifiedIds.map((id) => {
    const candidate = candidatesById.get(id)!;
    return { id, titulo: candidate.title, url: candidate.public_url };
  });
}
