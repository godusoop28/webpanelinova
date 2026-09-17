import "server-only";
import { env } from "@/lib/env";
import { listPublishedProperties, getProperty, type EasyBrokerProperty } from "@/lib/services/easybroker.service";
import { openAiJsonCompletion } from "@/lib/integrations/openai.client";
import {
  AiPropertySearchResponseSchema,
  verifyAiOptions,
  type PropertySearchOption,
} from "@/lib/property-search-schema";

/**
 * Fase 23: the old Make scenario walked 5 pages of 50 (250 properties) —
 * kept as the default, but centralized here instead of hardcoded in five
 * places, so changing it later is a one-line edit.
 */
const DEFAULT_MAX_PAGES = 5;
const PAGE_SIZE = 50;

export interface PropertySearchResult {
  resultado: "ok" | "sin_coincidencias" | "sin_resultados";
  opciones: PropertySearchOption[];
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

  const pages = await Promise.all(
    Array.from({ length: maxPages }, (_, i) => listPublishedProperties(i + 1, PAGE_SIZE))
  );
  const candidates = pages.flat();
  const byId = new Map(candidates.map((p) => [p.public_id, p]));

  if (candidates.length === 0) {
    return { resultado: "sin_resultados", opciones: [] };
  }

  const raw = await openAiJsonCompletion({
    model: env.openai.propertySearchModel,
    userPrompt: buildPrompt(query, buildCandidateText(candidates)),
  });

  let parsed;
  try {
    parsed = AiPropertySearchResponseSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("[PROPERTY_SEARCH] La IA devolvió una respuesta que no cumple el schema esperado.");
  }

  const verified = verifyAiOptions(parsed.opciones, byId);
  if (verified.length === 0) {
    return { resultado: "sin_coincidencias", opciones: [] };
  }

  // Re-fetch each verified property individually for an accurate title/url
  // (mirrors the original Make scenario's two-step list-then-detail shape).
  const details = await Promise.all(verified.map((option) => getProperty(option.id).catch(() => null)));
  const opciones: PropertySearchOption[] = verified.map((option, index) => ({
    id: option.id,
    titulo: details[index]?.title ?? option.titulo,
    url: details[index]?.public_url ?? option.url,
  }));

  return { resultado: "ok", opciones };
}
