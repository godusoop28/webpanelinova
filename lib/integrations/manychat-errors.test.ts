import { describe, expect, it } from "vitest";
import {
  classifyManyChatFailure,
  ManyChatApiError,
  ManyChatConfigError,
  ManyChatNetworkError,
  ManyChatTimeoutError,
  manyChatProviderMessage,
  parseRetryAfter,
  sanitize,
} from "@/lib/integrations/manychat-errors";

const SEND_FLOW = "POST /fb/sending/sendFlow";

describe("classifyManyChatFailure", () => {
  it("HTTP 200 con status:error es un rechazo, no un éxito, y conserva el mensaje del proveedor", () => {
    const error = new ManyChatApiError(200, "OK", { status: "error", message: "Validation error", details: { messages: [{ message: "Wrong flow_ns" }] } }, SEND_FLOW);
    const failure = classifyManyChatFailure(error);
    expect(failure).toMatchObject({ kind: "FLOW", retryable: false, uncertain: false, code: "BODY_ERROR_200" });
    expect(failure.reason).toContain("Wrong flow_ns");
  });

  it("restricción del canal (ventana de 24 h) es permanente para la cola", () => {
    const error = new ManyChatApiError(400, "Bad Request", { status: "error", message: "Subscriber is out of the 24 hour window, use a message template" }, SEND_FLOW);
    expect(classifyManyChatFailure(error)).toMatchObject({ kind: "CHANNEL", retryable: false, code: "HTTP_400" });
  });

  it("400 sin cuerpo reconocible queda como REJECTED con el código HTTP", () => {
    const failure = classifyManyChatFailure(new ManyChatApiError(400, "Bad Request", null, SEND_FLOW));
    expect(failure).toMatchObject({ kind: "REJECTED", retryable: false, code: "HTTP_400" });
    expect(failure.reason).toMatch(/HTTP 400/);
  });

  it("401/403 es autenticación o permisos, sin reintento", () => {
    expect(classifyManyChatFailure(new ManyChatApiError(401, "Unauthorized", { status: "error", message: "Invalid token" }))).toMatchObject({ kind: "AUTH", retryable: false });
  });

  it("429 y 5xx son recuperables; 429 conserva Retry-After", () => {
    expect(classifyManyChatFailure(new ManyChatApiError(429, "Too Many Requests", null, SEND_FLOW, 30_000))).toMatchObject({ kind: "RATE_LIMIT", retryable: true, retryAfterMs: 30_000 });
    expect(classifyManyChatFailure(new ManyChatApiError(503, "Service Unavailable", null, SEND_FLOW))).toMatchObject({ kind: "PROVIDER", retryable: true });
  });

  it("timeout en un envío es incierto y no se reintenta; en una escritura idempotente sí", () => {
    const timeout = new ManyChatTimeoutError(SEND_FLOW, 10000);
    expect(classifyManyChatFailure(timeout)).toMatchObject({ kind: "TIMEOUT", uncertain: true, retryable: false });
    expect(classifyManyChatFailure(timeout, { idempotent: true })).toMatchObject({ kind: "TIMEOUT", uncertain: false, retryable: true });
    expect(classifyManyChatFailure(new ManyChatNetworkError(SEND_FLOW, new TypeError("fetch failed")))).toMatchObject({ kind: "NETWORK", uncertain: true });
  });

  it("falta de configuración se reporta con el nombre de la variable", () => {
    const failure = classifyManyChatFailure(new ManyChatConfigError("MANYCHAT_ADVISOR_FLOW_ID", "Falta MANYCHAT_ADVISOR_FLOW_ID"));
    expect(failure).toMatchObject({ kind: "CONFIG", retryable: false, code: "CONFIG_MANYCHAT_ADVISOR_FLOW_ID" });
  });

  it("una excepción local no se confunde con un rechazo del proveedor", () => {
    expect(classifyManyChatFailure(new Error("boom"))).toMatchObject({ kind: "LOCAL", retryable: false });
  });
});

describe("saneamiento", () => {
  it("no expone tokens ni teléfonos", () => {
    expect(sanitize("Bearer 123456:abcdefghijkl falló para +52 33 1234 5678")).not.toMatch(/abcdefghijkl|1234 5678/);
    expect(manyChatProviderMessage({ status: "error", message: "token 1234567:abcdefghijklmnop inválido" })).not.toContain("abcdefghijklmnop");
  });

  it("Retry-After en segundos o fecha", () => {
    expect(parseRetryAfter("12")).toBe(12_000);
    expect(parseRetryAfter(new Date(Date.UTC(2026, 0, 1, 0, 1)).toUTCString(), Date.UTC(2026, 0, 1))).toBe(60_000);
    expect(parseRetryAfter(null)).toBeNull();
  });
});
