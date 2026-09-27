import "server-only";
import { easyBrokerRequest, EasyBrokerApiError } from "@/lib/integrations/easybroker.client";
import { withRetry, pollUntil } from "@/lib/retry";

export interface EasyBrokerAgent {
  id?: string;
  name?: string;
  email?: string;
  mobile_phone?: string;
}

export interface EasyBrokerOperation {
  type?: string;
  amount?: number;
  currency?: string;
  formatted_amount?: string;
  unit?: string;
}

export interface EasyBrokerProperty {
  public_id: string;
  title: string;
  property_type?: string;
  /** Siempre texto: el detalle de EasyBroker devuelve un objeto {name, ...} y aquí se normaliza a su `name`. */
  location?: string;
  public_url?: string;
  agent?: EasyBrokerAgent;
  operations?: EasyBrokerOperation[];
  bedrooms?: number | null;
  bathrooms?: number | null;
  half_bathrooms?: number | null;
  parking_spaces?: number | null;
  lot_size?: number | null;
  construction_size?: number | null;
  description?: string | null;
  updated_at?: string;
  status?: string;
  show_prices?: boolean;
  features?: { name?: string }[];
  /** Clave interna de la inmobiliaria (solo en el detalle; suele venir null). */
  internal_id?: string | null;
}

/**
 * GET /properties devuelve `location` como texto, pero GET /properties/{id}
 * como objeto ({name, latitude, street, ...}). Sin normalizar, el aviso al
 * asesor mostraba "[object Object]". Se conserva solo el nombre público
 * (nunca calle/número: la propiedad puede ocultar su ubicación exacta).
 */
function normalizeProperty(raw: Record<string, unknown>): EasyBrokerProperty {
  const location = raw.location as unknown;
  return {
    ...(raw as unknown as EasyBrokerProperty),
    location:
      typeof location === "string"
        ? location
        : location && typeof location === "object" && typeof (location as { name?: unknown }).name === "string"
          ? (location as { name: string }).name
          : undefined,
  };
}

export interface EasyBrokerContactRequest {
  id?: string;
  contact_id?: string;
  phone?: string;
  source?: string;
  property_id?: string;
}

/**
 * EasyBroker's JSON actually returns `id` and `contact_id` as numbers, not
 * strings (confirmed against the real API — easy to miss since the rest of
 * the API returns string ids like "EB-WN8585"). Every field this app
 * persists is typed as a Postgres String column, so normalize here, once,
 * rather than at every call site.
 */
function normalizeContactRequest(raw: Record<string, unknown>): EasyBrokerContactRequest {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    phone: typeof raw.phone === "string" ? raw.phone : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    property_id: raw.property_id != null ? String(raw.property_id) : undefined,
  };
}

const RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 4000 };

export async function getProperty(publicId: string): Promise<EasyBrokerProperty> {
  return withRetry(
    () =>
      easyBrokerRequest<Record<string, unknown>>({ path: `/properties/${encodeURIComponent(publicId)}` }).then(normalizeProperty),
    RETRY_OPTIONS
  );
}

export async function listPublishedProperties(page: number, limit = 50): Promise<EasyBrokerProperty[]> {
  return (await listPublishedPropertiesPage(page, limit)).content;
}

/** Una página del inventario publicado, con la indicación de si hay más (para recorrerlo completo). */
export async function listPublishedPropertiesPage(
  page: number,
  limit = 50
): Promise<{ content: EasyBrokerProperty[]; total: number | null; hasNext: boolean }> {
  const result = await withRetry(
    () =>
      easyBrokerRequest<{ content: Record<string, unknown>[]; pagination?: { total?: number; next_page?: string | null } }>({
        path: "/properties",
        query: { page, limit, "search[statuses][]": "published" },
      }),
    RETRY_OPTIONS
  );
  return {
    content: (result.content ?? []).map(normalizeProperty),
    total: result.pagination?.total ?? null,
    hasNext: Boolean(result.pagination?.next_page),
  };
}

export interface EasyBrokerPropertyIntegration {
  integration_partner?: { name?: string; symbol?: string };
  operation_type?: string;
  remote_listing_id?: string | null;
  listing_url?: string | null;
  published?: boolean;
  status?: string;
}

/**
 * Anuncios de cada propiedad en portales (GET /property_integrations,
 * documentado en dev.easybroker.com; verificado el 27-sep-2026 con la
 * clave actual: Inmuebles24, Mercado Libre, Clasco, Pincali, ValoresAMPI…
 * con remote_listing_id y/o listing_url). Solo lectura.
 */
export async function listPropertyIntegrationsPage(
  page: number,
  limit = 50
): Promise<{ content: { public_id: string; integrations: EasyBrokerPropertyIntegration[] }[]; total: number | null; hasNext: boolean }> {
  const result = await withRetry(
    () =>
      easyBrokerRequest<{
        content?: { public_id: string; integrations?: EasyBrokerPropertyIntegration[] }[];
        pagination?: { total?: number; next_page?: string | null };
      }>({ path: "/property_integrations", query: { page, limit } }),
    RETRY_OPTIONS
  );
  return {
    content: (result.content ?? []).map((item) => ({ public_id: item.public_id, integrations: item.integrations ?? [] })),
    total: result.pagination?.total ?? null,
    hasNext: Boolean(result.pagination?.next_page),
  };
}

export async function createContactRequest(input: {
  name: string;
  phone: string;
  message: string;
  source: string;
  propertyId?: string;
}): Promise<EasyBrokerContactRequest> {
  const body: Record<string, unknown> = {
    name: input.name,
    phone: input.phone,
    message: input.message,
    source: input.source,
  };
  if (input.propertyId) body.property_id = input.propertyId;
  const raw = await withRetry(
    () => easyBrokerRequest<Record<string, unknown>>({ method: "POST", path: "/contact_requests", body }),
    { ...RETRY_OPTIONS, maxAttempts: 4 }
  );
  return normalizeContactRequest(raw);
}

export async function listRecentContactRequests(): Promise<EasyBrokerContactRequest[]> {
  const result = await withRetry(
    () => easyBrokerRequest<{ content: Record<string, unknown>[] }>({ path: "/contact_requests" }),
    RETRY_OPTIONS
  );
  return (result.content ?? []).map(normalizeContactRequest);
}

/**
 * EasyBroker's "agent" field on PATCH /contacts/{id} takes the advisor's
 * EasyBroker EMAIL, not an id — verified against the production Make
 * scenario's actual request body before writing this (it's easy to guess
 * wrong here and fail silently against the real API).
 */
export async function assignContactToAdvisor(contactId: string, advisorEasyBrokerEmail: string): Promise<void> {
  await withRetry(
    () =>
      easyBrokerRequest({
        method: "PATCH",
        path: `/contacts/${encodeURIComponent(contactId)}`,
        body: { agent: advisorEasyBrokerEmail },
      }),
    { ...RETRY_OPTIONS, maxAttempts: 4 }
  );
}

/**
 * Replaces Make's blind "wait 8s, GET, match" with retry/backoff (Fase 18).
 * Matches on phone + source, and property_id when the lead came from a
 * property — the strongest signals EasyBroker's contact_requests list
 * actually carries (there's no way to pass our own requestId through to
 * EasyBroker's side).
 */
export async function findRecentContactRequest(match: {
  phone: string;
  source: string;
  propertyId?: string;
}): Promise<EasyBrokerContactRequest | null> {
  return pollUntil(async () => {
    const requests = await listRecentContactRequests();
    return (
      requests.find(
        (request) =>
          request.phone === match.phone &&
          request.source === match.source &&
          (!match.propertyId || request.property_id === match.propertyId)
      ) ?? null
    );
  }, { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 8000 });
}

export { EasyBrokerApiError };
