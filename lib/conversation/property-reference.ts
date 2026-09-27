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

// Con esquema o "www.", o un dominio de portal conocido pegado sin esquema
// ("inmuebles24.com/propiedades/…", "articulo.mercadolibre.com.mx/MLM-…").
const URL_PATTERN =
  /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+|\b(?:[a-z0-9-]+\.)*(?:easybroker\.com|mercadolibre\.com\.mx|meli\.la|vivanuncios\.com\.mx|inmuebles24\.com|lamudi\.com\.mx|propiedades\.com|casasyterrenos\.com|century21mexico\.com|facebook\.com|fb\.me|fb\.com|clasco\.mx|pincali\.com|valoresampi\.mx)\/[^\s<>"'`]*/gi;

/** URLs presentes en el texto, sin puntuación final pegada. Máximo 3: nadie manda más en un mensaje legítimo. */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    let raw = match[0].replace(/[),.;:!?¡¿*_]+$/, "");
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

/** Parámetros de rastreo que no identifican el anuncio (se quitan antes de comparar). */
const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|igshid|igsh|mibextid|si|_gl|mc_[a-z]+|ref|ref_src|ref_url|source|s|share_id|rdid|sfnsn|from|tracking_id|searchVariation|position|type|reco_\w+|c_\w+|matt_\w+)$/i;

/** Envoltorios de redirección conocidos: el destino viene en la propia URL (no hace falta descargar nada). */
function unwrapRedirect(url: URL): URL | null {
  const host = url.hostname.toLowerCase();
  let target: string | null = null;
  if ((host === "l.facebook.com" || host === "lm.facebook.com" || host === "l.messenger.com" || host === "l.instagram.com") && url.pathname.startsWith("/l.php")) {
    target = url.searchParams.get("u");
  } else if (/^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname === "/url") {
    target = url.searchParams.get("q") ?? url.searchParams.get("url");
  }
  if (!target) return null;
  try {
    const inner = new URL(target);
    return inner.protocol === "https:" || inner.protocol === "http:" ? inner : null;
  } catch {
    return null;
  }
}

/**
 * Forma canónica de un enlace pegado por el cliente: desenvuelve
 * redirecciones conocidas (l.facebook.com, google.com/url), quita
 * parámetros de rastreo y el fragmento, y pasa http a https. Conserva los
 * parámetros que pueden identificar el anuncio.
 */
export function canonicalizeUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  } catch {
    return null;
  }
  for (let i = 0; i < 2; i++) {
    const inner = unwrapRedirect(url);
    if (!inner) break;
    url = inner;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

/** Símbolo del portal (mismo que usa EasyBroker en /property_integrations cuando existe). */
export function portalOfHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is("easybroker.com")) return "easybroker";
  if (is("inmuebles24.com")) return "inmuebles24";
  if (is("mercadolibre.com.mx") || is("meli.la")) return "mercado_libre";
  if (is("vivanuncios.com.mx")) return "vivanuncios";
  if (is("lamudi.com.mx")) return "proppit_by_lamudi";
  if (is("propiedades.com")) return "propiedades_com";
  if (is("casasyterrenos.com")) return "casas_y_terrenos";
  if (is("century21mexico.com")) return "century21_mexico";
  if (is("facebook.com") || is("fb.me") || is("fb.com")) return "facebook";
  if (is("clasco.mx")) return "clasco";
  if (is("pincali.com")) return "pincali";
  if (is("valoresampi.mx")) return "valores_ampi";
  return null;
}

export const PORTAL_LABELS: Record<string, string> = {
  easybroker: "EasyBroker",
  inmuebles24: "Inmuebles24",
  mercado_libre: "Mercado Libre",
  vivanuncios: "Vivanuncios",
  proppit_by_lamudi: "Lamudi",
  propiedades_com: "Propiedades.com",
  casas_y_terrenos: "Casas y Terrenos",
  century21_mexico: "Century 21 México",
  facebook: "Facebook",
  clasco: "Clasco",
  pincali: "Pincali",
  valores_ampi: "ValoresAMPI",
};

/**
 * Clave estable de un anuncio a partir de su URL (y el ID remoto que da
 * EasyBroker, si lo hay). Sirve para cruzar el enlace del cliente con los
 * anuncios publicados que reporta EasyBroker, sin leer la página.
 */
export function portalListingKeyFromUrl(rawUrl: string, remoteListingId?: string | null): { portal: string; externalKey: string } | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const portal = portalOfHost(url.hostname);
  if (!portal || portal === "easybroker") return null;
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Codificación inválida: se usa tal cual.
  }
  const remote = remoteListingId?.trim();
  let key: string | null = null;
  switch (portal) {
    case "inmuebles24":
      key = remote && /^\d+$/.test(remote) ? remote : /-(\d{6,})\.html$/.exec(path)?.[1] ?? null;
      break;
    case "mercado_libre": {
      const id = /MLM-?(\d{6,})/i.exec(path + url.search)?.[1];
      key = id ? `MLM${id}` : null;
      break;
    }
    case "clasco":
      key = /_(\d{5,})\/?$/.exec(path)?.[1] ?? null;
      break;
    case "pincali":
      key = /\/inmueble\/([a-z0-9-]+)\/?$/i.exec(path)?.[1]?.toLowerCase() ?? null;
      break;
    case "valores_ampi":
      key = /external-properties\/(\d+)/.exec(path)?.[1] ?? null;
      break;
    case "proppit_by_lamudi":
      key = /\/detalle\/([a-z0-9-]{6,})/i.exec(path)?.[1]?.toLowerCase() ?? null;
      break;
    case "facebook":
      key = /\/marketplace\/item\/(\d+)/.exec(path)?.[1] ?? null;
      break;
    case "century21_mexico":
      key = /\/propiedad\/(\d{4,})/.exec(path)?.[1] ?? null;
      break;
    default:
      // Vivanuncios, Propiedades.com, Casas y Terrenos: el ID es el último número largo de la ruta.
      key = [...path.matchAll(/(\d{6,})/g)].at(-1)?.[1] ?? null;
  }
  if (!key && remote) key = remote;
  return key ? { portal, externalKey: key } : null;
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
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) return null;
  const url = new URL(canonical);
  let decoded = url.pathname + " " + url.search;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Codificación inválida: se usa tal cual.
  }
  const codes = extractEasyBrokerCodes(decoded);
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
