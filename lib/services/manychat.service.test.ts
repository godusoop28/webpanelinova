import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { manychat: { apiKey: "test-key", advisorFlowId: "content_test_flow" } } }));

const { sendFlow, setCustomFields } = await import("@/lib/services/manychat.service");
const { ManyChatApiError, ManyChatTimeoutError } = await import("@/lib/integrations/manychat-errors");

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body == null ? "" : JSON.stringify(body), { status, headers });
}

afterEach(() => vi.unstubAllGlobals());

describe("sendFlow (sin enviar nada real: fetch simulado)", () => {
  it("HTTP 200 con status:error lanza ManyChatApiError con el endpoint y el cuerpo, sin reintentar", async () => {
    const fetchMock = vi.fn(async () => respond(200, { status: "error", message: "Flow not found" }));
    vi.stubGlobal("fetch", fetchMock);
    const error = await sendFlow("123", "content_x").catch((e) => e);
    expect(error).toBeInstanceOf(ManyChatApiError);
    expect(error.endpoint).toBe("POST /fb/sending/sendFlow");
    expect(error.message).toContain("Flow not found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("400 no se reintenta en la misma petición", async () => {
    const fetchMock = vi.fn(async () => respond(400, { status: "error", message: "Subscriber is out of the 24 hour window" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendFlow("123", "content_x")).rejects.toBeInstanceOf(ManyChatApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("5xx se reintenta y termina con éxito", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(502, null)).mockResolvedValueOnce(respond(200, { status: "success" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendFlow("123", "content_x")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("429 con Retry-After no se reintenta en línea: lo agenda la cola", async () => {
    const fetchMock = vi.fn(async () => respond(429, { status: "error", message: "Too many requests" }, { "retry-after": "30" }));
    vi.stubGlobal("fetch", fetchMock);
    const error = await sendFlow("123", "content_x").catch((e) => e);
    expect(error.retryAfterMs).toBe(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("timeout del envío no se repite (resultado incierto)", async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendFlow("123", "content_x")).rejects.toBeInstanceOf(ManyChatTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("setCustomFields (idempotente) sí reintenta un timeout", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }))
      .mockResolvedValueOnce(respond(200, { status: "success" }));
    vi.stubGlobal("fetch", fetchMock);
    await setCustomFields("123", [{ fieldId: 1, value: "x" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
