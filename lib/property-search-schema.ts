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

const STOPWORDS = new Set([
  "a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "mi", "me",
  "por", "que", "se", "un", "una", "y", "quiero", "busco", "vi", "esta", "ese", "esa",
]);

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * No-AI fallback for when OpenAI is slow or down: scores each candidate by
 * how many of the query's words appear in its title/location (title counts
 * double). Returning *something* beats sending ManyChat an empty menu.
 */
export function keywordMatchProperties(
  query: string,
  candidates: { public_id: string; title: string; location?: string; public_url?: string }[]
): PropertySearchOption[] {
  const words = normalizeForMatch(query)
    .split(" ")
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
  if (words.length === 0) return [];

  return candidates
    .map((candidate) => {
      const title = ` ${normalizeForMatch(candidate.title)} `;
      const location = ` ${normalizeForMatch(candidate.location ?? "")} `;
      let score = 0;
      for (const word of words) {
        if (title.includes(` ${word} `)) score += 2;
        else if (location.includes(` ${word} `)) score += 1;
      }
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ candidate }) => ({ id: candidate.public_id, titulo: candidate.title, url: candidate.public_url }));
}
