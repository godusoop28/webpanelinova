import "server-only";
import { env } from "@/lib/env";

const BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 30000;

export class OpenAIApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown
  ) {
    super(`OpenAI API error ${status} ${statusText}`);
    this.name = "OpenAIApiError";
  }
}

/**
 * Plain fetch against Chat Completions with JSON-object mode — no SDK
 * dependency (Fase 48: no sobreingeniería). Never logs env.openai.apiKey
 * or the Authorization header (Fase 58).
 */
export async function openAiJsonCompletion(input: {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  timeoutMs?: number;
}): Promise<string> {
  const { model, systemPrompt, userPrompt, timeoutMs = DEFAULT_TIMEOUT_MS } = input;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new OpenAIApiError(response.status, response.statusText, data);
    }

    const content = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("[OPENAI] Respuesta sin contenido de texto utilizable.");
    }
    return content;
  } catch (error) {
    if (error instanceof OpenAIApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`[OPENAI] Timeout tras ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
