import "server-only";
import type { PropertyCacheEntry, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  EasyBrokerApiError,
  getProperty,
  listPublishedPropertiesPage,
  type EasyBrokerProperty,
} from "@/lib/services/easybroker.service";
import {
  extractEasyBrokerCodes,
  listingSlugFromPublicUrl,
  normalizeSearchText,
  parsePropertyUrl,
  scoreProperties,
} from "@/lib/conversation/property-reference";
import { extractPageTitle, fetchPublicPage } from "@/lib/services/link-fetch.service";

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
  if (newest && Date.now() - newest.syncedAt.getTime() < maxAgeMs) return { synced: false };
  try {
    await syncPropertyCatalog(companyId);
    return { synced: true };
  } catch (error) {
    return { synced: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }
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

export type LinkResolution =
  | { ok: true; publicId: string; via: "code" | "listing_slug" | "page_code" | "page_title" }
  | { ok: true; publicId: null; candidates: PropertyCandidate[]; via: "page_title" }
  | { ok: false; reason: string };

export async function resolvePropertyLink(companyId: string, rawUrl: string): Promise<LinkResolution> {
  const parsed = parsePropertyUrl(rawUrl);
  if (!parsed) return { ok: false, reason: "invalid_url" };

  if (parsed.kind === "easybroker_code") return { ok: true, publicId: parsed.code, via: "code" };

  if (parsed.kind === "easybroker_listing") {
    await ensureFreshCatalog(companyId);
    const entries = await prisma.propertyCacheEntry.findMany({
      where: { companyId, publicUrl: { not: null } },
      select: { publicId: true, publicUrl: true, published: true },
    });
    const match = entries.find((entry) => listingSlugFromPublicUrl(entry.publicUrl) === parsed.slug);
    if (match) {
      return match.published ? { ok: true, publicId: match.publicId, via: "listing_slug" } : { ok: false, reason: "property_unpublished" };
    }
    // Un listing de EasyBroker que no es del inventario de la empresa (u otro
    // aún no indexado): se intenta leer la página si el dominio está permitido.
  }

  const page = await fetchPublicPage(rawUrl, env.assistant.linkDomains);
  if (!page.ok) return { ok: false, reason: page.reason };

  const codes = extractEasyBrokerCodes(page.html);
  if (codes.length === 1) return { ok: true, publicId: codes[0], via: "page_code" };

  const title = extractPageTitle(page.html);
  if (!title) return { ok: false, reason: "no_property_info" };
  const search = await searchCatalog(companyId, title, "any");
  if (!search.ok || search.candidates.length === 0) return { ok: false, reason: "not_in_inventory" };
  return { ok: true, publicId: null, candidates: search.candidates.slice(0, 3), via: "page_title" };
}
