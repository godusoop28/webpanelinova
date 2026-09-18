import { describe, it, expect } from "vitest";
import { extractCampaignPropertyCode } from "@/lib/campaign-code";

describe("extractCampaignPropertyCode", () => {
  it("extracts the code from free text with a prefix", () => {
    expect(extractCampaignPropertyCode("Me interesa EB-ABC123")).toBe("EB-ABC123");
  });

  it("extracts the code from free text with a different prefix", () => {
    expect(extractCampaignPropertyCode("Vi esta propiedad EB-12345")).toBe("EB-12345");
  });

  it("extracts a code that itself contains extra hyphens", () => {
    expect(extractCampaignPropertyCode("EB-XYZ-456")).toBe("EB-XYZ-456");
  });

  it("extracts a bare code with no surrounding text", () => {
    expect(extractCampaignPropertyCode("EB-WN8585")).toBe("EB-WN8585");
  });

  it("returns null when there's no EB- code", () => {
    expect(extractCampaignPropertyCode("Ninguna de las anteriores")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractCampaignPropertyCode("")).toBeNull();
  });
});
