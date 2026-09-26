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

export interface ResponsesInputItem {
  [key: string]: unknown;
}

export interface ResponsesResult {
  id: string;
  status: string;
  output: ResponsesInputItem[];
  outputText: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  incompleteReason: string | null;
}

/**
 * Responses API (herramientas + salida JSON Schema estricta). Verificado
 * contra la cuenta: gpt-5.4-mini rechaza herramientas con razonamiento en
 * /chat/completions, así que el asistente conversacional usa este endpoint.
 * `store: false`: OpenAI no conserva la conversación; el razonamiento
 * cifrado se reenvía dentro del mismo turno y nunca se guarda en la base.
 */
export async function openAiResponses(input: {
  model: string;
  instructions: string;
  input: ResponsesInputItem[];
  tools?: readonly unknown[];
  /** "none" en la última ronda obliga a cerrar con la respuesta final. */
  toolChoice?: "auto" | "none";
  textFormat?: { name: string; schema: unknown };
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  timeoutMs?: number;
}): Promise<ResponsesResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = input;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        store: false,
        include: ["reasoning.encrypted_content"],
        instructions: input.instructions,
        input: input.input,
        ...(input.tools?.length ? { tools: input.tools, parallel_tool_calls: true, tool_choice: input.toolChoice ?? "auto" } : {}),
        ...(input.textFormat
          ? { text: { format: { type: "json_schema", name: input.textFormat.name, strict: true, schema: input.textFormat.schema } } }
          : {}),
        ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
        max_output_tokens: input.maxOutputTokens ?? 2000,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw new OpenAIApiError(response.status, response.statusText, data ?? text.slice(0, 500));
    }
    if (!data) throw new Error("[OPENAI] Respuesta vacía de /responses.");

    const output = Array.isArray(data.output) ? (data.output as ResponsesInputItem[]) : [];
    const outputText = output
      .filter((item) => item.type === "message")
      .flatMap((item) => (Array.isArray(item.content) ? (item.content as { type?: string; text?: string }[]) : []))
      .filter((part) => part.type === "output_text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    const usage = (data.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
    const incomplete = data.incomplete_details as { reason?: string } | null | undefined;

    return {
      id: String(data.id ?? ""),
      status: String(data.status ?? ""),
      output,
      outputText: outputText || null,
      usage: { inputTokens: usage.input_tokens ?? null, outputTokens: usage.output_tokens ?? null },
      incompleteReason: incomplete?.reason ?? null,
    };
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
