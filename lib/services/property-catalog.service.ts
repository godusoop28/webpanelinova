import "server-only";
import type { PropertyCacheEntry, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  EasyBrokerApiError,
  getProperty,
  listPropertyIntegrationsPage,
  listPublishedPropertiesPage,
  type EasyBrokerProperty,
} from "@/lib/services/easybroker.service";
import {
  canonicalizeUrl,
  extractEasyBrokerCodes,
  listingSlugFromPublicUrl,
  normalizeSearchText,
  parsePropertyUrl,
  portalListingKeyFromUrl,
  portalOfHost,
  scoreProperties,
} from "@/lib/conversation/property-reference";
import { fetchPublicPage } from "@/lib/services/link-fetch.service";
import {
  extractListingInfo,
  matchListingToCatalog,
  slugKeywords,
  type ListingInfo,
  type MatchConfidence,
} from "@/lib/conversation/listing-extract";

/**
 * Índice local del inventario publicado de EasyBroker para que el asistente
 * busque sin mandar el catálogo completo a OpenAI en cada turno. EasyBroker
 * sigue siendo la fuente de verdad: antes de afirmar precio o
 * disponibilidad se consulta el detalle vivo (getPublicProperty).
 */

const PAGE_SIZE = 50;
const MAX_PAGES = 40;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DETAIL_CONCURRENCY = 4;

function operationsText(operations: EasyBrokerProperty["operations"]): string {
  return (operations ?? [])
    .map((op) => `${op.type === "rental" ? "renta" : op.type === "sale" ? "venta" : op.type ?? ""} ${op.formatted_amount ?? ""}`.trim())
    .join(" · ");
}

function buildSearchText(property: EasyBrokerProperty): string {
  return normalizeSearchText(
    [property.public_id, property.title, property.property_type, property.location, operationsText(property.operations)]
      .filter(Boolean)
      .join(" ")
  );
}

export interface CatalogSyncSummary {
  total: number;
  upserted: number;
  detailsFetched: number;
  unpublished: number;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Recorre TODAS las páginas publicadas (el total lo informa la primera; el
 * límite fijo de 5 páginas del flujo anterior dejaba propiedades fuera). El
 * listado no trae public_url: se pide el detalle solo de las propiedades
 * nuevas o modificadas desde la última sincronización.
 */
export async function syncPropertyCatalog(companyId: string): Promise<CatalogSyncSummary> {
  const first = await listPublishedPropertiesPage(1, PAGE_SIZE);
  const totalPages = Math.min(first.total != null ? Math.ceil(first.total / PAGE_SIZE) : first.hasNext ? MAX_PAGES : 1, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => listPublishedPropertiesPage(i + 2, PAGE_SIZE))
  );
  const listed = [...first.content, ...rest.flatMap((page) => page.content)];

  const existing = await prisma.propertyCacheEntry.findMany({ where: { companyId } });
  const byId = new Map(existing.map((entry) => [entry.publicId, entry]));

  const needsDetail = listed.filter((property) => {
    const entry = byId.get(property.public_id);
    return !entry || !entry.publicUrl || entry.ebUpdatedAt !== (property.updated_at ?? null);
  });
  const details = await mapWithConcurrency(needsDetail, DETAIL_CONCURRENCY, (property) =>
    getProperty(property.public_id).catch(() => null)
  );
  const detailById = new Map(details.filter((d): d is EasyBrokerProperty => Boolean(d)).map((d) => [d.public_id, d]));

  const now = new Date();
  for (const property of listed) {
    const detail = detailById.get(property.public_id);
    const merged: EasyBrokerProperty = { ...property, ...(detail ?? {}), location: detail?.location ?? property.location };
    const data = {
      title: merged.title,
      propertyType: merged.property_type ?? null,
      location: merged.location ?? null,
      operations: (merged.operations ?? []) as unknown as Prisma.InputJsonValue,
      bedrooms: merged.bedrooms ?? null,
      bathrooms: merged.bathrooms ?? null,
      publicUrl: merged.public_url ?? byId.get(property.public_id)?.publicUrl ?? null,
      internalId: detail ? (typeof detail.internal_id === "string" && detail.internal_id.trim() ? detail.internal_id.trim().slice(0, 60) : null) : byId.get(property.public_id)?.internalId ?? null,
      searchText: buildSearchText(merged),
      // Si el detalle falló, no se guarda la marca de tiempo: se reintenta en la próxima sincronización.
      ebUpdatedAt: detail || !needsDetail.includes(property) ? property.updated_at ?? null : null,
      published: true,
      syncedAt: now,
    };
    await prisma.propertyCacheEntry.upsert({
      where: { companyId_publicId: { companyId, publicId: property.public_id } },
      create: { companyId, publicId: property.public_id, ...data },
      update: data,
    });
  }

  const listedIds = listed.map((property) => property.public_id);
  const unpublished = await prisma.propertyCacheEntry.updateMany({
    where: { companyId, published: true, publicId: { notIn: listedIds } },
    data: { published: false, syncedAt: now },
  });

  return { total: listed.length, upserted: listed.length, detailsFetched: detailById.size, unpublished: unpublished.count };
}

/** Sincroniza si el índice está vacío o viejo. Nunca lanza: un índice algo desactualizado es mejor que ninguno. */
export async function ensureFreshCatalog(companyId: string, maxAgeMs = CACHE_MAX_AGE_MS): Promise<{ synced: boolean; error?: string }> {
  const newest = await prisma.propertyCacheEntry.findFirst({
    where: { companyId },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  if (newest && Date.now() - newest.syncedAt.getTime() < maxAgeMs) {
    // Los anuncios de portales se agregaron después: si aún no hay, se traen ya.
    if (!(await prisma.portalListing.findFirst({ where: { companyId }, select: { id: true } }))) {
      await syncPortalListings(companyId).catch((error) => console.error("[CATALOG] anuncios de portales no sincronizados", error instanceof Error ? error.message : error));
    }
    return { synced: false };
  }
  try {
    await syncPropertyCatalog(companyId);
  } catch (error) {
    return { synced: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }
  try {
    await syncPortalListings(companyId);
  } catch (error) {
    // Sin anuncios de portales solo se pierde la vía rápida de identificación; el resto sigue.
    console.error("[CATALOG] anuncios de portales no sincronizados", error instanceof Error ? error.message : error);
  }
  return { synced: true };
}

export interface PropertyCandidate {
  public_id: string;
  title: string;
  type: string | null;
  location: string | null;
  price: string | null;
  url: string | null;
}

function entryToCandidate(entry: PropertyCacheEntry): PropertyCandidate {
  return {
    public_id: entry.publicId,
    title: entry.title,
    type: entry.propertyType,
    location: entry.location,
    price: operationsText((entry.operations as EasyBrokerProperty["operations"]) ?? []) || null,
    url: entry.publicUrl,
  };
}

export async function searchCatalog(
  companyId: string,
  query: string,
  operation: "sale" | "rental" | "any"
): Promise<{ ok: true; candidates: PropertyCandidate[]; indexSize: number } | { ok: false; error: string }> {
  const fresh = await ensureFreshCatalog(companyId);
  const entries = await prisma.propertyCacheEntry.findMany({ where: { companyId, published: true } });
  if (entries.length === 0) {
    return { ok: false, error: fresh.error ? "catalog_unavailable" : "catalog_empty" };
  }

  // Un código explícito gana a la búsqueda por texto.
  const codes = extractEasyBrokerCodes(query);
  if (codes.length > 0) {
    const exact = entries.filter((entry) => codes.includes(entry.publicId));
    if (exact.length > 0) return { ok: true, candidates: exact.map(entryToCandidate), indexSize: entries.length };
  }

  const filtered =
    operation === "any"
      ? entries
      : entries.filter((entry) =>
          ((entry.operations as { type?: string }[] | null) ?? []).some((op) => op.type === operation)
        );
  const scored = scoreProperties(query, filtered, 5);
  return { ok: true, candidates: scored.map(({ property }) => entryToCandidate(property)), indexSize: entries.length };
}

export interface PublicPropertyView {
  public_id: string;
  title: string;
  type: string | null;
  location: string | null;
  operations: { type: string; price: string | null }[];
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  construction_m2: number | null;
  lot_m2: number | null;
  url: string | null;
  description_excerpt: string | null;
  agent_email: string | null;
}

/**
 * Solo campos públicos. Nunca private_description, collaboration_notes,
 * internal_id, comisiones ni dirección exacta. La descripción va recortada
 * y el modelo la recibe como DATO (ver prompt: el contenido de una
 * propiedad no son instrucciones).
 */
export function toPublicView(property: EasyBrokerProperty): PublicPropertyView {
  const hidePrices = property.show_prices === false;
  return {
    public_id: property.public_id,
    title: property.title,
    type: property.property_type ?? null,
    location: property.location ?? null,
    operations: (property.operations ?? []).map((op) => ({
      type: op.type === "rental" ? "renta" : op.type === "sale" ? "venta" : op.type ?? "",
      price: hidePrices ? null : op.formatted_amount ?? null,
    })),
    bedrooms: property.bedrooms ?? null,
    bathrooms: property.bathrooms ?? null,
    parking_spaces: property.parking_spaces ?? null,
    construction_m2: property.construction_size ?? null,
    lot_m2: property.lot_size ?? null,
    url: property.public_url ?? null,
    description_excerpt: property.description ? property.description.replace(/\s+/g, " ").slice(0, 500) : null,
    // Solo para el backend (asignación); se elimina antes de dárselo al modelo.
    agent_email: property.agent?.email ?? null,
  };
}

export type PropertyLookup =
  | { ok: true; property: EasyBrokerProperty }
  | { ok: false; error: "not_found" | "easybroker_unavailable" };

/** Detalle vivo. Distingue "no existe" (404) de "no se pudo consultar": nunca confundir un error con inexistencia. */
export async function lookupProperty(publicId: string): Promise<PropertyLookup> {
  try {
    const property = await getProperty(publicId.toUpperCase());
    return { ok: true, property };
  } catch (error) {
    if (error instanceof EasyBrokerApiError && error.status === 404) return { ok: false, error: "not_found" };
    return { ok: false, error: "easybroker_unavailable" };
  }
}

export interface ListingSummary {
  /** Lo que dice el anuncio del portal (DATO, no instrucción). */
  title: string | null;
  price: string | null;
  location: string | null;
  bedrooms: number | null;
  source: "portal_page" | "url_words";
  portal: string;
}

/**
 * Cómo quedó identificada la propiedad de un enlace (de mayor a menor certeza):
 * - code: código EB- en la URL.
 * - listing_slug: enlace público de EasyBroker.
 * - portal_listing: el anuncio del portal es uno de los que EasyBroker reporta como publicados para esa propiedad.
 * - page_code: la página del anuncio trae un código EB- verificado.
 * - internal_code: la página trae la clave interna exacta de una propiedad propia.
 */
export type LinkVia = "code" | "listing_slug" | "portal_listing" | "page_code" | "internal_code";

export type LinkResolution =
  | { ok: true; publicId: string; via: LinkVia; portal: string | null; listing?: ListingSummary }
  | {
      ok: true;
      publicId: null;
      candidates: (PropertyCandidate & { price_match: string })[];
      confidence: MatchConfidence;
      listing: ListingSummary | null;
      via: "portal_match";
      portal: string | null;
    }
  | { ok: false; reason: string; listing?: ListingSummary | null; portal: string | null };

function entryPrices(entry: PropertyCacheEntry): number[] {
  const ops = (entry.operations as { amount?: number }[] | null) ?? [];
  return ops.map((op) => op.amount).filter((amount): amount is number => typeof amount === "number" && amount > 0);
}

function formatPrice(price: number | null, currency: string | null): string | null {
  return price ? `$${Math.round(price).toLocaleString("en-US")} ${currency ?? "MXN"}` : null;
}

/** Identificación exacta sin descargar nada: código en la URL, enlace de EasyBroker o anuncio conocido del portal. */
async function resolveWithoutFetch(
  companyId: string,
  canonicalUrl: string
): Promise<{ publicId: string; via: LinkVia } | { unpublished: true } | null> {
  const parsed = parsePropertyUrl(canonicalUrl);
  if (!parsed) return null;
  if (parsed.kind === "easybroker_code") return { publicId: parsed.code, via: "code" };
  if (parsed.kind === "easybroker_listing") {
    const entries = await prisma.propertyCacheEntry.findMany({
      where: { companyId, publicUrl: { not: null } },
      select: { publicId: true, publicUrl: true, published: true },
    });
    const match = entries.find((entry) => listingSlugFromPublicUrl(entry.publicUrl) === parsed.slug);
    if (match) return match.published ? { publicId: match.publicId, via: "listing_slug" } : { unpublished: true };
    return null;
  }
  const key = portalListingKeyFromUrl(canonicalUrl);
  if (key) {
    const listing = await prisma.portalListing.findUnique({
      where: { companyId_portal_externalKey: { companyId, portal: key.portal, externalKey: key.externalKey } },
      select: { publicId: true },
    });
    if (listing) return { publicId: listing.publicId, via: "portal_listing" };
  }
  return null;
}

/** Claves internas de propiedades propias que aparecen como palabra completa en el anuncio. */
async function findInternalCodeMatches(companyId: string, text: string): Promise<string[]> {
  const entries = await prisma.propertyCacheEntry.findMany({
    where: { companyId, internalId: { not: null } },
    select: { publicId: true, internalId: true },
  });
  const haystack = ` ${normalizeSearchText(text)} `;
  return entries
    .filter((entry) => {
      const code = normalizeSearchText(entry.internalId ?? "");
      // Claves cortas o solo numéricas cortas coinciden por casualidad: no se usan.
      return code.length >= 4 && /\d/.test(code) && haystack.includes(` ${code} `);
    })
    .map((entry) => entry.publicId);
}

/**
 * Identifica la propiedad de un enlace, en este orden:
 * 1. Código EB- en la URL (tras quitar rastreo y desenvolver redirecciones conocidas).
 * 2. Enlace público de EasyBroker → por slug en el índice.
 * 3. Anuncio conocido: el ID/URL del portal coincide con un anuncio que
 *    EasyBroker reporta para una propiedad propia (API oficial, sin leer la página).
 * 4. Enlaces cortos (meli.la, fb.me…): se sigue la redirección permitida y se repiten 1–3.
 * 5. Lectura pública de la página si el portal lo permite: código EB- o
 *    clave interna exacta del anuncio.
 * 6. Si no hay coincidencia exacta: candidatas por título/zona/precio, que
 *    SIEMPRE requieren confirmación del cliente (nunca se afirma una
 *    propiedad solo porque el título se parece).
 */
export async function resolvePropertyLink(companyId: string, rawUrl: string): Promise<LinkResolution> {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) return { ok: false, reason: "invalid_url", portal: null };
  const portal = portalOfHost(new URL(canonical).hostname);

  const parsedCode = parsePropertyUrl(canonical);
  if (parsedCode?.kind === "easybroker_code") return { ok: true, publicId: parsedCode.code, via: "code", portal };

  await ensureFreshCatalog(companyId);
  const direct = await resolveWithoutFetch(companyId, canonical);
  if (direct && "publicId" in direct) return { ok: true, ...direct, portal };
  if (direct) return { ok: false, reason: "property_unpublished", portal };

  let info: ListingInfo | null = null;
  let source: ListingSummary["source"] = "portal_page";
  const page = await fetchPublicPage(canonical, env.assistant.linkDomains);
  let finalPortal = portal;
  if (page.ok) {
    const finalCanonical = canonicalizeUrl(page.finalUrl);
    if (finalCanonical && finalCanonical !== canonical) {
      finalPortal = portalOfHost(new URL(finalCanonical).hostname) ?? portal;
      const viaRedirect = await resolveWithoutFetch(companyId, finalCanonical);
      if (viaRedirect && "publicId" in viaRedirect) return { ok: true, ...viaRedirect, portal: finalPortal };
      if (viaRedirect) return { ok: false, reason: "property_unpublished", portal: finalPortal };
    }
    info = extractListingInfo(page.html);
    for (const code of info.codes.slice(0, 2)) {
      const lookup = await lookupProperty(code);
      if (lookup.ok) return { ok: true, publicId: lookup.property.public_id, via: "page_code", portal: finalPortal };
    }
    const internal = await findInternalCodeMatches(companyId, `${info.title ?? ""} ${info.description ?? ""}`);
    if (internal.length === 1) return { ok: true, publicId: internal[0], via: "internal_code", portal: finalPortal };
    if (!info.title && !info.description) info = null;
  }
  if (!info) {
    // Bloqueado (403/anti-bots), sin acceso o sin datos: solo las palabras del enlace.
    const words = slugKeywords(canonical);
    if (words.split(" ").length < 2) {
      return { ok: false, reason: page.ok ? "no_property_info" : page.reason, portal: finalPortal };
    }
    info = { title: words, description: null, price: null, currency: null, location: null, bedrooms: null, codes: [] };
    source = "url_words";
  }

  const listing: ListingSummary = {
    title: info.title,
    price: formatPrice(info.price, info.currency),
    location: info.location,
    bedrooms: info.bedrooms,
    source,
    portal: new URL(canonical).hostname.replace(/^www\./, ""),
  };

  const entries = await prisma.propertyCacheEntry.findMany({ where: { companyId, published: true } });
  if (entries.length === 0) return { ok: false, reason: "inventory_unavailable", listing, portal: finalPortal };
  const { matches, confidence } = matchListingToCatalog(
    info,
    entries.map((entry) => ({ entry, publicId: entry.publicId, title: entry.title, searchText: entry.searchText, prices: entryPrices(entry), bedrooms: entry.bedrooms }))
  );
  // Confianza baja = probablemente anuncio de otra inmobiliaria: no se
  // ofrecen candidatas débiles como si fueran "la misma".
  if (matches.length === 0 || confidence === "low") return { ok: false, reason: "not_in_inventory", listing, portal: finalPortal };
  return {
    ok: true,
    publicId: null,
    candidates: matches.map((m) => ({ ...entryToCandidate(m.property.entry), price_match: m.priceMatch })),
    // Con solo palabras de la URL nunca hay confianza alta.
    confidence: source === "url_words" && confidence === "high" ? "medium" : confidence,
    listing,
    via: "portal_match",
    portal: finalPortal,
  };
}

// ---------------------------------------------------------------------------
// Anuncios en portales reportados por EasyBroker
// ---------------------------------------------------------------------------

/**
 * Sincroniza los anuncios de portales de cada propiedad (GET
 * /property_integrations). Solo se guardan anuncios con clave estable
 * (ID remoto o URL con ID); los que EasyBroker reporta sin URL (p. ej.
 * Lamudi) no permiten identificar un enlace y se omiten.
 */
export async function syncPortalListings(companyId: string): Promise<{ total: number; saved: number }> {
  const first = await listPropertyIntegrationsPage(1, PAGE_SIZE);
  const totalPages = Math.min(first.total != null ? Math.ceil(first.total / PAGE_SIZE) : first.hasNext ? MAX_PAGES : 1, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => listPropertyIntegrationsPage(i + 2, PAGE_SIZE))
  );
  const properties = [...first.content, ...rest.flatMap((page) => page.content)];
  const now = new Date();
  let saved = 0;
  for (const property of properties) {
    for (const integration of property.integrations) {
      const symbol = integration.integration_partner?.symbol?.trim();
      if (!symbol) continue;
      const url = integration.listing_url?.trim() || null;
      const canonical = url ? canonicalizeUrl(url) : null;
      const key = canonical ? portalListingKeyFromUrl(canonical, integration.remote_listing_id) : null;
      const externalKey = key?.externalKey ?? integration.remote_listing_id?.trim() ?? null;
      if (!externalKey) continue;
      // El símbolo del portal se toma de la URL cuando se reconoce (así coincide con el enlace del cliente).
      const portal = key?.portal ?? symbol;
      const data = {
        publicId: property.public_id,
        portalName: integration.integration_partner?.name?.slice(0, 80) ?? symbol,
        listingUrl: canonical,
        published: Boolean(integration.published),
        status: integration.status ?? null,
        syncedAt: now,
      };
      await prisma.portalListing.upsert({
        where: { companyId_portal_externalKey: { companyId, portal, externalKey } },
        create: { companyId, portal, externalKey, source: "easybroker_integration", ...data },
        update: data,
      });
      saved += 1;
    }
  }
  return { total: properties.length, saved };
}
