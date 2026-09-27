/**
 * Lectura de anuncios de portales (Mercado Libre, Vivanuncios, Inmuebles24,
 * Lamudi, Facebook…) para cruzarlos con el inventario propio. Puro: recibe
 * HTML/URL ya descargados. Todo lo extraído es DATO del anuncio, nunca
 * instrucción.
 *
 * Verificado el 26-sep-2026: Mercado Libre y Vivanuncios devuelven og:title,
 * og:description y JSON-LD; Inmuebles24 y Lamudi bloquean a clientes
 * automatizados (403) — ahí solo quedan las palabras de la URL. No se
 * intenta saltar bloqueos.
 */
import { extractEasyBrokerCodes, normalizeSearchText, searchTokens } from "@/lib/conversation/property-reference";

export interface ListingInfo {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  location: string | null;
  bedrooms: number | null;
  /** Códigos EB- que aparecen en el anuncio (un portal alimentado por EasyBroker suele incluirlo). */
  codes: string[];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\\u002F/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']{1,2000})["']`, "i").exec(html);
  const b = new RegExp(`<meta[^>]+content=["']([^"']{1,2000})["'][^>]*(?:property|name)=["']${escaped}["']`, "i").exec(html);
  const value = a?.[1] ?? b?.[1];
  return value ? decodeEntities(value) : null;
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d.]/g, "");
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Recorre objetos JSON-LD buscando nombre, precio, dirección y recámaras. */
function readJsonLd(html: string): Partial<ListingInfo> {
  const out: Partial<ListingInfo> = {};
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].slice(0, 10);
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    const obj = node as Record<string, unknown>;
    const type = String(obj["@type"] ?? "");
    if (type === "WebSite" || type === "Organization" || type === "BreadcrumbList") return;
    if (!out.title && typeof obj.name === "string" && obj.name.length > 8) out.title = decodeEntities(obj.name);
    if (!out.description && typeof obj.description === "string") out.description = decodeEntities(obj.description).slice(0, 600);
    const offers = obj.offers as Record<string, unknown> | undefined;
    if (offers && typeof offers === "object") {
      out.price ??= parsePrice(offers.price);
      if (!out.currency && typeof offers.priceCurrency === "string") out.currency = offers.priceCurrency;
    }
    out.price ??= parsePrice(obj.price);
    const rooms = obj.numberOfBedrooms ?? obj.numberOfRooms;
    if (out.bedrooms == null && (typeof rooms === "number" || typeof rooms === "string")) {
      const n = Number(typeof rooms === "string" ? rooms.replace(/\D/g, "") : rooms);
      if (n > 0 && n < 50) out.bedrooms = n;
    }
    const address = obj.address as Record<string, unknown> | undefined;
    if (!out.location && address && typeof address === "object") {
      const parts = [address.streetAddress, address.addressLocality, address.addressRegion].filter((p) => typeof p === "string" && p);
      if (parts.length) out.location = decodeEntities(parts.join(", "));
    }
    for (const value of Object.values(obj)) if (value && typeof value === "object") visit(value, depth + 1);
  };
  for (const block of blocks) {
    try {
      visit(JSON.parse(block[1].trim()), 0);
    } catch {
      // JSON-LD inválido: se ignora.
    }
  }
  return out;
}

const PRICE_IN_TEXT = /\$\s?([\d]{1,3}(?:[,.]\d{3})+|\d{5,})/;
const BEDROOMS_IN_TEXT = /(\d{1,2})\s*(?:rec[aá]maras?|habitaciones?|dormitorios?|cuartos?)/i;

export function extractListingInfo(html: string): ListingInfo {
  const ld = readJsonLd(html);
  const ogTitle = metaContent(html, "og:title");
  const titleTag = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1];
  const title = (ld.title ?? ogTitle ?? (titleTag ? decodeEntities(titleTag) : null))
    ?.replace(/\s*[|–-]\s*(MercadoLibre|Mercado Libre|Vivanuncios|Inmuebles24|Lamudi|Facebook).*$/i, "")
    .slice(0, 200) ?? null;
  const description = (ld.description ?? metaContent(html, "og:description") ?? metaContent(html, "description"))?.slice(0, 600) ?? null;
  const textForNumbers = `${ogTitle ?? ""} ${title ?? ""} ${description ?? ""}`;
  const priceMatch = PRICE_IN_TEXT.exec(textForNumbers);
  const bedroomsMatch = BEDROOMS_IN_TEXT.exec(textForNumbers);
  // Solo el contenido principal cuenta para códigos: título, descripción y
  // metadatos (no los anuncios "similares" del resto de la página).
  const codes = extractEasyBrokerCodes(`${title ?? ""} ${description ?? ""} ${metaContent(html, "og:url") ?? ""}`);
  const bodyCodes = extractEasyBrokerCodes(html);
  return {
    title: title || null,
    description,
    price: ld.price ?? (priceMatch ? parsePrice(priceMatch[1]) : null),
    currency: ld.currency ?? (priceMatch ? "MXN" : null),
    location: ld.location ?? null,
    bedrooms: ld.bedrooms ?? (bedroomsMatch ? Number(bedroomsMatch[1]) : null),
    codes: codes.length ? codes : bodyCodes.length === 1 ? bodyCodes : [],
  };
}

const SLUG_NOISE = new Set([
  "propiedad", "propiedades", "detalle", "anuncio", "clasificado", "veclcain", "vecl", "jm", "mlm", "html", "a", "s", "for", "sale", "item", "listing",
  "listings", "inmueble", "inmuebles", "marketplace", "www", "com", "mx", "p", "id",
]);

/** Palabras útiles de la URL cuando el portal no deja leer la página. */
export function slugKeywords(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const words = normalizeSearchText(decodeURIComponent(url.pathname))
      .split(" ")
      .filter(
        (word) =>
          word.length > 1 &&
          !SLUG_NOISE.has(word) &&
          // identificadores: números, hashes y códigos tipo mlm123456
          !/\d/.test(word)
      );
    return words.slice(0, 20).join(" ");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Cruce con el inventario propio
// ---------------------------------------------------------------------------

export interface CatalogListing {
  publicId: string;
  title: string;
  searchText: string;
  prices: number[];
  bedrooms: number | null;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface ListingMatch<T> {
  property: T;
  score: number;
  priceMatch: "exact" | "close" | "different" | "unknown";
}

function priceRelation(listingPrice: number | null, prices: number[]): ListingMatch<unknown>["priceMatch"] {
  if (!listingPrice || prices.length === 0) return "unknown";
  const best = Math.min(...prices.map((p) => Math.abs(p - listingPrice) / Math.max(p, listingPrice)));
  if (best <= 0.02) return "exact";
  if (best <= 0.1) return "close";
  return "different";
}

/**
 * Puntúa cada propiedad del inventario contra el anuncio. Las palabras
 * pesan por su rareza en el inventario (IDF): "chapalita" o "almendro"
 * identifican; "casa", "venta" o "zapopan" casi no. Una candidata necesita
 * al menos una coincidencia distintiva de nombre/zona: el precio y las
 * recámaras solo confirman, nunca identifican por sí solos (verificado con
 * anuncios reales: un precio parecido emparejaba casas de otra colonia).
 * - high: una sola candidata clara, con coincidencia distintiva y precio igual (±2 %).
 * - medium: candidatas con coincidencia distintiva, sin certeza.
 * - low: nada convincente (probablemente anuncio de otra inmobiliaria).
 */
/** Palabras del sector que no identifican una propiedad ni una zona. */
const GENERIC_WORDS = new Set([
  "casa", "casas", "venta", "renta", "vende", "rento", "departamento", "depto", "terreno", "lote", "lotes", "local",
  "oficina", "bodega", "loft", "residencia", "residencial", "fraccionamiento", "colonia", "zona", "coto", "privada",
  "condominio", "preventa", "lujo", "nueva", "nuevo", "hermosa", "amplia", "amplio", "excelente", "ubicada", "ubicacion",
  "frente", "cerca", "vista", "alberca", "jardin", "terraza", "zapopan", "guadalajara", "jalisco", "tlajomulco",
  "tlaquepaque", "tonala", "mexico", "estrenar", "oportunidad", "recamaras", "banos", "remodelar", "exclusiva",
  "exclusivo", "moderna", "moderno", "gran", "precio",
]);

const PROPERTY_TYPES: Record<string, string> = {
  casa: "casa",
  casas: "casa",
  residencia: "casa",
  departamento: "departamento",
  depto: "departamento",
  loft: "departamento",
  terreno: "terreno",
  lote: "terreno",
  lotes: "terreno",
  bodega: "bodega",
  oficina: "oficina",
  local: "local",
};

function propertyTypeOf(text: string): string | null {
  for (const word of normalizeSearchText(text).split(" ")) {
    if (PROPERTY_TYPES[word]) return PROPERTY_TYPES[word];
  }
  return null;
}

export function matchListingToCatalog<T extends CatalogListing>(
  info: Pick<ListingInfo, "title" | "description" | "location" | "price" | "bedrooms">,
  catalog: T[],
  limit = 3
): { matches: ListingMatch<T>[]; confidence: MatchConfidence } {
  // Solo título y zona identifican; la descripción del anuncio no (trae
  // palabras de relleno que aparecen en cualquier ficha).
  const queryTokens = searchTokens([info.title, info.location].filter(Boolean).join(" ")).filter((t) => !GENERIC_WORDS.has(t));
  if (queryTokens.length === 0 || catalog.length === 0) return { matches: [], confidence: "low" };
  const listingType = propertyTypeOf(info.title ?? "");

  const docs = catalog.map((property) => ({
    property,
    title: ` ${normalizeSearchText(property.title)} `,
    haystack: ` ${property.searchText} `,
  }));
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const token of queryTokens) {
    const df = docs.filter((doc) => doc.haystack.includes(` ${token} `) || doc.title.includes(` ${token} `)).length;
    idf.set(token, df === 0 ? 0 : Math.log((n + 1) / (df + 0.5)));
  }
  // Distintiva: aparece en pocas fichas (≤ 10 % del inventario, mínimo 2).
  const distinctiveLimit = Math.max(2, Math.floor(n * 0.1));

  // Frases de dos palabras significativas ("valle real", "coto almendro"):
  // distinguen zonas que comparten una palabra ("valle imperial").
  const queryWords = normalizeSearchText([info.title, info.location].filter(Boolean).join(" ")).split(" ");
  const bigrams = new Set<string>();
  for (let i = 0; i < queryWords.length - 1; i++) {
    const pair = [queryWords[i], queryWords[i + 1]];
    if (pair.every((w) => w.length >= 4) && !pair.every((w) => GENERIC_WORDS.has(w))) bigrams.add(`${queryWords[i]} ${queryWords[i + 1]}`);
  }

  const scored = docs.map(({ property, title, haystack }) => {
    let text = 0;
    let distinctive = 0;
    for (const bigram of bigrams) {
      if (haystack.includes(` ${bigram} `) || title.includes(` ${bigram} `)) {
        text += 3;
        distinctive += 1;
      }
    }
    for (const token of queryTokens) {
      const inTitle = title.includes(` ${token} `);
      const inText = inTitle || haystack.includes(` ${token} `);
      if (!inText) continue;
      const df = docs.filter((doc) => doc.haystack.includes(` ${token} `) || doc.title.includes(` ${token} `)).length;
      const isDistinctive = df <= distinctiveLimit && token.length >= 4;
      // Palabras comunes (casa, venta, zapopan…) apenas suman.
      const weight = (idf.get(token) ?? 0) * (isDistinctive ? 1 : 0.25);
      text += weight * (inTitle ? 1.5 : 1);
      if (isDistinctive) distinctive += 1;
    }
    const priceMatch = priceRelation(info.price, property.prices);
    const priceScore = priceMatch === "exact" ? 2 : priceMatch === "close" ? 0.5 : priceMatch === "different" ? -2 : 0;
    const bedroomScore = info.bedrooms && property.bedrooms ? (info.bedrooms === property.bedrooms ? 0.5 : -0.5) : 0;
    const candidateType = propertyTypeOf(property.title) ?? propertyTypeOf(property.searchText);
    const typeScore = listingType && candidateType && listingType !== candidateType ? -4 : 0;
    return { property, score: text + typeScore + (distinctive > 0 ? priceScore + bedroomScore : 0), priceMatch, distinctive };
  });

  const ranked = scored.filter((s) => s.distinctive > 0 && s.score > 1.5).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];
  let confidence: MatchConfidence = "low";
  if (top) {
    const clearLead = !second || top.score - second.score >= 1.5;
    if (top.priceMatch === "exact" && clearLead) confidence = "high";
    else if (top.priceMatch !== "different") confidence = "medium";
  }
  return {
    matches: ranked.slice(0, limit).map(({ property, score, priceMatch }) => ({ property, score, priceMatch })),
    confidence,
  };
}
