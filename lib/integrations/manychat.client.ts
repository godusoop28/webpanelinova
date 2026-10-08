import "server-only";
import { env } from "@/lib/env";
import { ManyChatApiError, ManyChatNetworkError, ManyChatTimeoutError, parseRetryAfter } from "@/lib/integrations/manychat-errors";

const BASE_URL = "https://api.manychat.com";
const DEFAULT_TIMEOUT_MS = 10000;

export { ManyChatApiError, ManyChatTimeoutError, ManyChatNetworkError } from "@/lib/integrations/manychat-errors";

interface ManyChatRequestOptions {
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  timeoutMs?: number;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Never logs env.manychat.apiKey or the Authorization header (Fase 58). */
export async function manyChatRequest<T>(options: ManyChatRequestOptions): Promise<T> {
  const { method = "POST", path, body, query, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.manychat.apiKey}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;

    // ManyChat a veces responde HTTP 200 con {"status":"error"}: no es éxito.
    const bodyStatus = (data as { status?: unknown } | null)?.status;
    if (!response.ok || bodyStatus === "error") {
      throw new ManyChatApiError(response.status, response.statusText, data, `${method} ${path}`, parseRetryAfter(response.headers.get("retry-after")));
    }
    return data as T;
  } catch (error) {
    if (error instanceof ManyChatApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ManyChatTimeoutError(`${method} ${path}`, timeoutMs);
    }
    // fetch lanza TypeError ante fallos de red; no se sabe si la petición llegó.
    if (error instanceof TypeError) throw new ManyChatNetworkError(`${method} ${path}`, error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
