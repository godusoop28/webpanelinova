import "server-only";
import { env } from "@/lib/env";
import { listPublishedProperties, getProperty, type EasyBrokerProperty } from "@/lib/services/easybroker.service";
import { openAiJsonCompletion } from "@/lib/integrations/openai.client";
import {
  AiPropertySearchResponseSchema,
  verifyAiOptions,
  keywordMatchProperties,
  type PropertySearchOption,
} from "@/lib/property-search-schema";

/**
 * Fase 23: the old Make scenario walked 5 pages of 50 (250 properties) —
 * kept as the default, but centralized here instead of hardcoded in five
 * places, so changing it later is a one-line edit.
 */
const DEFAULT_MAX_PAGES = 5;
const PAGE_SIZE = 50;
// ManyChat's External Request gives up after ~10s and then shows the client
// an empty menu, so OpenAI must answer well inside that window.
const AI_TIMEOUT_MS = 6000;

export interface PropertySearchResult {
  resultado: "ok" | "sin_coincidencias" | "sin_resultados";
  opciones: PropertySearchOption[];
  /** "ai" normally; "keyword" when OpenAI failed and the local matcher answered. */
  metodo?: "ai" | "keyword";
  /** Why the AI path was skipped, when it was. */
  aiError?: string;
}

function buildCandidateText(properties: EasyBrokerProperty[]): string {
  return properties
    .map(
      (p) =>
        `ID: ${p.public_id}\nTítulo: ${p.title}\nTipo: ${p.property_type ?? ""}\nUbicación: ${p.location ?? ""}\nPrecio: ${p.operations?.[0]?.formatted_amount ?? ""}`
    )
    .join("\n\n---\n\n");
}

function buildPrompt(query: string, candidatesText: string): string {
  return `Analiza la búsqueda del cliente y la lista de propiedades disponibles.

Búsqueda del cliente:
${query}

Lista de propiedades:
${candidatesText}

Devuelve únicamente un JSON válido con esta forma exacta, sin markdown ni texto adicional:
{"resultado":"ok","opciones":[{"id":"...","titulo":"..."}]}

Reglas:
- Máximo 3 opciones.
- La prioridad máxima es el título de la propiedad; si el cliente escribe el nombre exacto o parcial de una propiedad, prioriza esas coincidencias.
- Si el cliente escribe una zona, torre, fraccionamiento o referencia, búscala en título y ubicación.
- Ignora mayúsculas, minúsculas y acentos.
- Si escribe "departamento" o "casa", prioriza ese tipo de propiedad.
- No elijas propiedades sin relación clara con la búsqueda.
- No repitas el mismo id en más de una opción.
- Usa ÚNICAMENTE ids que aparezcan en la lista de propiedades de arriba. No inventes ids ni títulos.
- Si no hay ninguna propiedad relacionada, responde {"resultado":"sin_coincidencias","opciones":[]}.`;
}

/**
 * Fase 24: never trusts an AI-returned id blindly — every option is
 * checked against the candidate set fetched from EasyBroker before being
 * returned, and then re-fetched individually for an accurate title/url
 * (mirrors the original Make scenario's two-step list-then-detail shape).
 */
export async function searchProperties(
  query: string,
  options: { maxPages?: number } = {}
): Promise<PropertySearchResult> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  // allSettled: one failed EasyBroker page shouldn't empty the whole search.
  const pages = await Promise.allSettled(
    Array.from({ length: maxPages }, (_, i) => listPublishedProperties(i + 1, PAGE_SIZE))
  );
  const candidates = pages.flatMap((page) => (page.status === "fulfilled" ? page.value : []));
  const byId = new Map(candidates.map((p) => [p.public_id, p]));

  if (candidates.length === 0) {
    const failed = pages.find((page) => page.status === "rejected");
    if (failed) throw failed.reason;
    return { resultado: "sin_resultados", opciones: [] };
  }

  let parsed;
  try {
    const raw = await openAiJsonCompletion({
      model: env.openai.propertySearchModel,
      userPrompt: buildPrompt(query, buildCandidateText(candidates)),
      timeoutMs: AI_TIMEOUT_MS,
    });
    parsed = AiPropertySearchResponseSchema.parse(JSON.parse(raw));
  } catch (error) {
    const aiError = error instanceof Error ? error.message : "Error desconocido de OpenAI";
    const opciones = keywordMatchProperties(query, candidates);
    return { resultado: opciones.length > 0 ? "ok" : "sin_coincidencias", opciones, metodo: "keyword", aiError };
  }

  const verified = verifyAiOptions(parsed.opciones, byId);
  if (verified.length === 0) {
    return { resultado: "sin_coincidencias", opciones: [], metodo: "ai" };
  }

  // Re-fetch each verified property individually for an accurate title/url
  // (mirrors the original Make scenario's two-step list-then-detail shape).
  const details = await Promise.all(verified.map((option) => getProperty(option.id).catch(() => null)));
  const opciones: PropertySearchOption[] = verified.map((option, index) => ({
    id: option.id,
    titulo: details[index]?.title ?? option.titulo,
    url: details[index]?.public_url ?? option.url,
  }));

  return { resultado: "ok", opciones, metodo: "ai" };
}
