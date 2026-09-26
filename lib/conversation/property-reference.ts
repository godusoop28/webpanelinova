/**
 * Detección de referencias a propiedades en texto libre del cliente:
 * códigos EasyBroker y enlaces. Puro (sin red): la resolución contra el
 * inventario real vive en lib/services/property-catalog.service.ts.
 */

// Mismo patrón que lib/campaign-code.ts, pero tolerante a minúsculas y a
// espacios/guion bajo que la gente mete al escribir el código a mano
// ("eb wn8585", "EB_WN8585").
const EB_CODE_PATTERN = /\bEB[\s_-]?([A-Z]{2}\d{3,6})\b/gi;

/** Códigos EasyBroker normalizados ("EB-WN8585"), sin duplicados, en orden de aparición. */
export function extractEasyBrokerCodes(text: string): string[] {
  const codes = new Set<string>();
  for (const match of text.matchAll(EB_CODE_PATTERN)) {
    codes.add(`EB-${match[1].toUpperCase()}`);
  }
  return [...codes];
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+|\b(?:www\.)[^\s<>"'`]+/gi;

/** URLs presentes en el texto, sin puntuación final pegada. Máximo 3: nadie manda más en un mensaje legítimo. */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    let raw = match[0].replace(/[),.;:!?¡¿]+$/, "");
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    try {
      const url = new URL(raw);
      if (!urls.includes(url.toString())) urls.push(url.toString());
    } catch {
      // No es una URL válida: se ignora.
    }
    if (urls.length >= 3) break;
  }
  return urls;
}

export type ParsedPropertyUrl =
  | { kind: "easybroker_code"; code: string }
  | { kind: "easybroker_listing"; slug: string }
  | { kind: "other"; hostname: string };

/**
 * Clasifica una URL sin descargarla. Un código EB- en la ruta o query gana
 * siempre (muchos portales lo incluyen); los enlaces públicos de
 * EasyBroker (easybroker.com/listings/<slug>, con o sin prefijo de país)
 * se resuelven por slug contra el índice local.
 */
export function parsePropertyUrl(rawUrl: string): ParsedPropertyUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const codes = extractEasyBrokerCodes(decodeURIComponent(url.pathname + " " + url.search));
  if (codes.length > 0) return { kind: "easybroker_code", code: codes[0] };

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "easybroker.com" || hostname.endsWith(".easybroker.com")) {
    const match = /\/listings\/([^/?#]+)/.exec(url.pathname);
    if (match) return { kind: "easybroker_listing", slug: match[1].toLowerCase() };
  }
  return { kind: "other", hostname };
}

/** Slug de un public_url de EasyBroker, para indexarlo. */
export function listingSlugFromPublicUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const parsed = parsePropertyUrl(publicUrl);
  return parsed?.kind === "easybroker_listing" ? parsed.slug : null;
}

export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "mi", "me", "por", "que", "se",
  "un", "una", "y", "o", "quiero", "busco", "vi", "esta", "este", "ese", "esa", "informacion", "info",
  "hola", "para", "sobre", "precio", "me", "interesa", "propiedad", "the", "tiene", "hay",
]);

// Sinónimos frecuentes en búsquedas inmobiliarias de WhatsApp.
const SYNONYMS: Record<string, string[]> = {
  depa: ["departamento"],
  depto: ["departamento"],
  dpto: ["departamento"],
  departamentos: ["departamento"],
  casas: ["casa"],
  terrenos: ["terreno"],
  lote: ["terreno"],
  venta: ["venta"],
  renta: ["renta"],
  zapo: ["zapopan"],
  gdl: ["guadalajara"],
};

export function searchTokens(query: string): string[] {
  const tokens = new Set<string>();
  for (const word of normalizeSearchText(query).split(" ")) {
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    tokens.add(word);
    for (const synonym of SYNONYMS[word] ?? []) tokens.add(synonym);
  }
  return [...tokens];
}

export interface SearchableProperty {
  publicId: string;
  title: string;
  searchText: string;
}

/**
 * Puntuación léxica simple sobre el índice local (título pesa el doble).
 * Con ~50–500 propiedades es suficiente y determinista; la IA recibe solo
 * los mejores candidatos, nunca el catálogo completo.
 */
export function scoreProperties<T extends SearchableProperty>(query: string, properties: T[], limit = 5): { property: T; score: number }[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  return properties
    .map((property) => {
      const title = ` ${normalizeSearchText(property.title)} `;
      const haystack = ` ${property.searchText} `;
      let score = 0;
      for (const token of tokens) {
        if (title.includes(` ${token} `)) score += 3;
        else if (title.includes(token)) score += 2;
        else if (haystack.includes(` ${token} `)) score += 1.5;
        else if (token.length >= 4 && haystack.includes(token)) score += 0.75;
      }
      return { property, score: score / Math.sqrt(tokens.length) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
