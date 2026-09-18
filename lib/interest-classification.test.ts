import { describe, it, expect } from "vitest";
import { classifyInterest } from "@/lib/interest-classification";

describe("classifyInterest", () => {
  describe("PROPERTY", () => {
    it.each(["Propiedad", "Vi una propiedad", "PROPERTY", "property"])("normalizes %s", (raw) => {
      const result = classifyInterest(raw);
      expect(result.interestType).toBe("PROPERTY");
      expect(result.assignmentRoute).toBe("PROPERTY");
      expect(result.routeLabel).toBe("Vi una propiedad");
    });
  });

  describe("EXPLORE", () => {
    it.each(["Explorar", "Explorar opciones", "Asesoría", "Asesoria", "EXPLORE", "explore"])(
      "normalizes %s",
      (raw) => {
        const result = classifyInterest(raw);
        expect(result.interestType).toBe("EXPLORE");
        expect(result.assignmentRoute).toBe("EXPLORE");
        expect(result.routeLabel).toBe("Explorar opciones");
      }
    );
  });

  describe("CAMPAIGN", () => {
    it.each(["Campaña", "Campana", "campaign", "CAMPAIGN", "Campaña propiedad"])("normalizes %s", (raw) => {
      const result = classifyInterest(raw);
      expect(result.interestType).toBe("CAMPAIGN");
      expect(result.assignmentRoute).toBe("CAMPAIGN");
      expect(result.routeLabel).toBe("Campaña propiedad");
    });
  });

  describe("TIMEOUT", () => {
    it.each(["Sin respuesta", "Timeout", "TIMEOUT", "sin_respuesta"])(
      "normalizes %s to the single canonical TIMEOUT route",
      (raw) => {
        const result = classifyInterest(raw);
        expect(result.interestType).toBe("TIMEOUT");
        expect(result.assignmentRoute).toBe("TIMEOUT");
        expect(result.routeLabel).toBe("Timeout");
      }
    );

    it("routes 'Sin respuesta' and 'Timeout' identically (same advisor pool)", () => {
      expect(classifyInterest("Sin respuesta")).toEqual(classifyInterest("Timeout"));
    });
  });

  describe("unrecognized input", () => {
    it("falls back to EXPLORE/OTHER instead of dropping the lead", () => {
      const result = classifyInterest("algo que nunca hemos visto");
      expect(result.interestType).toBe("OTHER");
      expect(result.assignmentRoute).toBe("EXPLORE");
    });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(classifyInterest("  CAMPAÑA  ").interestType).toBe("CAMPAIGN");
  });
});
