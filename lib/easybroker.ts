import "server-only";
import { env } from "@/lib/env";

const BASE_URL = "https://api.easybroker.com/v1";

/**
 * EasyBroker responses are tolerant by nature: not every property or
 * contact record carries every field, so every attribute besides `id`
 * (and `public_id` for properties) is modeled as optional. Consumers
 * must render an explicit "sin dato" state instead of assuming presence.
 */

export interface EasyBrokerAgent {
  id?: string;
  name?: string;
  full_name?: string;
  mobile_phone?: string;
  profile_image_url?: string;
  email?: string;
}

export interface EasyBrokerPropertyLocation {
  name?: string;
  latitude?: number;
  longitude?: number;
}

export interface EasyBrokerPropertyOperation {
  type?: string;
  amount?: number;
  currency?: string;
  formatted_amount?: string;
}

export interface EasyBrokerProperty {
  public_id: string;
  title?: string;
  title_image_url?: string;
  status?: string;
  property_type?: string;
  location?: EasyBrokerPropertyLocation;
  operations?: EasyBrokerPropertyOperation[];
  bedrooms?: number;
  bathrooms?: number;
  parking_spaces?: number;
  construction_size?: number;
  lot_size?: number;
  created_at?: string;
  updated_at?: string;
  agent?: EasyBrokerAgent;
  public_url?: string;
}

export interface EasyBrokerPagination {
  limit: number;
  page: number;
  total: number;
  next_page?: string | null;
}

export interface EasyBrokerListResponse<T> {
  content: T[];
  pagination: EasyBrokerPagination;
}

export interface EasyBrokerContact {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  phones?: { area_code?: string; number?: string }[];
  emails?: { email_address?: string }[];
  tags?: string[];
  agent?: EasyBrokerAgent;
}

export interface EasyBrokerContactRequest {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  contact_id?: string;
  property_id?: string;
  message?: string;
  source?: string;
  happened_at?: string;
}

export class EasyBrokerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = "EasyBrokerApiError";
  }
}

async function easybrokerFetch<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
  revalidateSeconds = 120
): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      "X-Authorization": env.easybroker.apiKey,
      Accept: "application/json",
    },
    next: { revalidate: revalidateSeconds, tags: ["easybroker"] },
  });

  if (!response.ok) {
    throw new EasyBrokerApiError(
      `EasyBroker respondió ${response.status} en ${endpoint}`,
      response.status,
      endpoint
    );
  }

  return (await response.json()) as T;
}

export async function getProperties(options?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<EasyBrokerListResponse<EasyBrokerProperty>> {
  return easybrokerFetch<EasyBrokerListResponse<EasyBrokerProperty>>("/properties", {
    page: options?.page ?? 1,
    limit: options?.limit ?? 20,
    search: options?.search,
  });
}

/**
 * Walks every page of /properties. Use sparingly (dashboard metrics only)
 * since EasyBroker paginates in small chunks.
 */
export async function getAllProperties(maxPages = 10): Promise<EasyBrokerProperty[]> {
  const all: EasyBrokerProperty[] = [];
  let page = 1;
  while (page <= maxPages) {
    const { content, pagination } = await getProperties({ page, limit: 50 });
    all.push(...content);
    if (!pagination.next_page || content.length === 0) break;
    page += 1;
  }
  return all;
}

export async function getPropertyByPublicId(
  publicId: string
): Promise<EasyBrokerProperty> {
  return easybrokerFetch<EasyBrokerProperty>(`/properties/${publicId}`);
}

export async function getContactRequests(options?: {
  page?: number;
  limit?: number;
}): Promise<EasyBrokerListResponse<EasyBrokerContactRequest>> {
  return easybrokerFetch<EasyBrokerListResponse<EasyBrokerContactRequest>>(
    "/contact_requests",
    { page: options?.page ?? 1, limit: options?.limit ?? 20 },
    60
  );
}

export async function getContact(contactId: string): Promise<EasyBrokerContact> {
  return easybrokerFetch<EasyBrokerContact>(`/contacts/${contactId}`);
}

/**
 * EasyBroker doesn't expose a dedicated metrics endpoint, so these
 * aggregate from list responses. When the underlying data can't
 * support a computation (e.g. missing pagination totals), callers
 * should surface "sin dato" rather than fabricate a number.
 */
export interface ContactMetrics {
  totalContactRequests: number | null;
}

export async function getContactMetrics(): Promise<ContactMetrics> {
  try {
    const { pagination } = await getContactRequests({ page: 1, limit: 1 });
    return { totalContactRequests: pagination.total ?? null };
  } catch {
    return { totalContactRequests: null };
  }
}

export interface PropertyMetrics {
  totalProperties: number | null;
}

export async function getPropertyMetrics(): Promise<PropertyMetrics> {
  try {
    const { pagination } = await getProperties({ page: 1, limit: 1 });
    return { totalProperties: pagination.total ?? null };
  } catch {
    return { totalProperties: null };
  }
}
