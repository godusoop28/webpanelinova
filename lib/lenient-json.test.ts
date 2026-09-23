import { describe, it, expect } from "vitest";
import { parseLenientJson } from "@/lib/lenient-json";

describe("parseLenientJson", () => {
  it("parses valid JSON unchanged", () => {
    expect(parseLenientJson('{\n  "a": "b"\n}')).toEqual({ a: "b" });
  });

  it("accepts a raw line break inside a string (ManyChat campaign message)", () => {
    const body = '{"interes_cliente": "Campaña", "datos_propiedad": "¡Hola! Quiero más información de EB-XB2547\nCasa frente al Lago de Chapala"}';
    expect(parseLenientJson(body)).toEqual({
      interes_cliente: "Campaña",
      datos_propiedad: "¡Hola! Quiero más información de EB-XB2547\nCasa frente al Lago de Chapala",
    });
  });

  it("accepts CRLF and tabs inside strings", () => {
    expect(parseLenientJson('{"a": "x\r\n\ty"}')).toEqual({ a: "x\r\n\ty" });
  });

  it("keeps already-escaped sequences intact", () => {
    expect(parseLenientJson('{"a": "say \\"hi\\"\nok"}')).toEqual({ a: 'say "hi"\nok' });
  });

  it("still rejects genuinely malformed JSON", () => {
    expect(() => parseLenientJson('{"a": ')).toThrow();
  });
});
