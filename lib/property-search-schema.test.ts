import { describe, it, expect } from "vitest";
import { AiPropertySearchResponseSchema, verifyAiOptions } from "@/lib/property-search-schema";

describe("AiPropertySearchResponseSchema", () => {
  it("accepts a well-formed response", () => {
    const result = AiPropertySearchResponseSchema.safeParse({
      resultado: "ok",
      opciones: [{ id: "EB-1", titulo: "Casa en Vía del Bosque" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 3 options", () => {
    const result = AiPropertySearchResponseSchema.safeParse({
      resultado: "ok",
      opciones: [
        { id: "1", titulo: "a" },
        { id: "2", titulo: "b" },
        { id: "3", titulo: "c" },
        { id: "4", titulo: "d" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an option with an empty id", () => {
    const result = AiPropertySearchResponseSchema.safeParse({
      resultado: "ok",
      opciones: [{ id: "", titulo: "a" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a response missing resultado", () => {
    const result = AiPropertySearchResponseSchema.safeParse({ opciones: [] });
    expect(result.success).toBe(false);
  });
});

describe("verifyAiOptions — never trust an AI-invented id blindly (Fase 24)", () => {
  const candidates = new Map([
    ["EB-1", { title: "Casa Real", public_url: "https://example.com/eb-1" }],
    ["EB-2", { title: "Depa Centro", public_url: "https://example.com/eb-2" }],
  ]);

  it("keeps an id that exists in the candidate set", () => {
    const result = verifyAiOptions([{ id: "EB-1" }], candidates);
    expect(result).toEqual([{ id: "EB-1", titulo: "Casa Real", url: "https://example.com/eb-1" }]);
  });

  it("drops an id the AI invented that isn't in the candidate set", () => {
    const result = verifyAiOptions([{ id: "EB-1" }, { id: "EB-999-does-not-exist" }], candidates);
    expect(result).toEqual([{ id: "EB-1", titulo: "Casa Real", url: "https://example.com/eb-1" }]);
  });

  it("returns [] when nothing the AI suggested exists in the candidate set", () => {
    expect(verifyAiOptions([{ id: "EB-999" }], candidates)).toEqual([]);
  });

  it("deduplicates a repeated id", () => {
    const result = verifyAiOptions([{ id: "EB-1" }, { id: "EB-1" }], candidates);
    expect(result).toHaveLength(1);
  });

  it("caps at 3 options even if more are given", () => {
    const many = new Map([
      ["1", { title: "a" }],
      ["2", { title: "b" }],
      ["3", { title: "c" }],
      ["4", { title: "d" }],
    ]);
    const result = verifyAiOptions([{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }], many);
    expect(result).toHaveLength(3);
  });

  it("uses the candidate's real title, ignoring whatever title the AI proposed", () => {
    const result = verifyAiOptions([{ id: "EB-1" }], candidates);
    expect(result[0].titulo).toBe("Casa Real");
  });
});
