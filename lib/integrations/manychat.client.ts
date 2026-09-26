import "server-only";
import { env } from "@/lib/env";

const BASE_URL = "https://api.manychat.com";
const DEFAULT_TIMEOUT_MS = 10000;

export class ManyChatApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown
  ) {
    super(`ManyChat API error ${status} ${statusText}`);
    this.name = "ManyChatApiError";
  }
}

/**
 * La petición salió pero no hubo respuesta a tiempo: ManyChat pudo haberla
 * aceptado. Para envíos al cliente esto es AMBIGUO y no debe reintentarse a
 * ciegas (se duplicaría el mensaje).
 */
export class ManyChatTimeoutError extends Error {
  constructor(public path: string, timeoutMs: number) {
    super(`[MANYCHAT] Timeout tras ${timeoutMs}ms en ${path}`);
    this.name = "ManyChatTimeoutError";
  }
}

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

    // ManyChat a veces responde HTTP 200 con {"status":"error"}.
    const bodyStatus = (data as { status?: unknown } | null)?.status;
    if (!response.ok || bodyStatus === "error") {
      throw new ManyChatApiError(response.status, response.statusText, data);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ManyChatApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ManyChatTimeoutError(`${method} ${path}`, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
