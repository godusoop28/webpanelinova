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

interface ManyChatRequestOptions {
  path: string;
  body: unknown;
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
  const { path, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(BASE_URL + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.manychat.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new ManyChatApiError(response.status, response.statusText, data);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ManyChatApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`[MANYCHAT] Timeout tras ${timeoutMs}ms en POST ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
