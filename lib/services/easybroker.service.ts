import "server-only";
import { easyBrokerRequest, EasyBrokerApiError } from "@/lib/integrations/easybroker.client";
import { withRetry, pollUntil } from "@/lib/retry";

export interface EasyBrokerAgent {
  id?: string;
  name?: string;
  email?: string;
  mobile_phone?: string;
}

export interface EasyBrokerProperty {
  public_id: string;
  title: string;
  property_type?: string;
  location?: string;
  public_url?: string;
  agent?: EasyBrokerAgent;
  operations?: { formatted_amount?: string }[];
}

export interface EasyBrokerContactRequest {
  id?: string;
  contact_id?: string;
  phone?: string;
  source?: string;
  property_id?: string;
}

const RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 4000 };

export async function getProperty(publicId: string): Promise<EasyBrokerProperty> {
  return withRetry(
    () => easyBrokerRequest<EasyBrokerProperty>({ path: `/properties/${encodeURIComponent(publicId)}` }),
    RETRY_OPTIONS
  );
}

export async function listPublishedProperties(page: number, limit = 50): Promise<EasyBrokerProperty[]> {
  const result = await withRetry(
    () =>
      easyBrokerRequest<{ content: EasyBrokerProperty[] }>({
        path: "/properties",
        query: { page, limit, "search[statuses][]": "published" },
      }),
    RETRY_OPTIONS
  );
  return result.content ?? [];
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
  return withRetry(
    () => easyBrokerRequest<EasyBrokerContactRequest>({ method: "POST", path: "/contact_requests", body }),
    { ...RETRY_OPTIONS, maxAttempts: 4 }
  );
}

export async function listRecentContactRequests(): Promise<EasyBrokerContactRequest[]> {
  const result = await withRetry(
    () => easyBrokerRequest<{ content: EasyBrokerContactRequest[] }>({ path: "/contact_requests" }),
    RETRY_OPTIONS
  );
  return result.content ?? [];
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
