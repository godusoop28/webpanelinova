import "server-only";
import { env } from "@/lib/env";

const BASE_URL = "https://api.easybroker.com/v1";
const DEFAULT_TIMEOUT_MS = 15000;

export class EasyBrokerApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown
  ) {
    super(`EasyBroker API error ${status} ${statusText}`);
    this.name = "EasyBrokerApiError";
  }
}

interface EasyBrokerRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Base URL and auth header centralized here (Fase 17: "NO dejes URLs
 * repetidas por todas partes"). Never logs env.easybroker.apiKey or the
 * X-Authorization header (Fase 58).
 */
export async function easyBrokerRequest<T>(options: EasyBrokerRequestOptions): Promise<T> {
  const { method = "GET", path, query, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "X-Authorization": env.easybroker.apiKey,
        accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new EasyBrokerApiError(response.status, response.statusText, data);
    }
    return data as T;
  } catch (error) {
    if (error instanceof EasyBrokerApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`[EASYBROKER] Timeout tras ${timeoutMs}ms en ${method} ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
