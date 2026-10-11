import { describe, it, expect } from "vitest";
import { normalizePhoneE164, phoneDigitsOnly, samePhone } from "@/lib/phone";

describe("phoneDigitsOnly", () => {
  it("strips everything but digits", () => {
    expect(phoneDigitsOnly("+52 (998) 111-2233")).toBe("529981112233");
  });

  it("returns empty string for null/undefined", () => {
    expect(phoneDigitsOnly(null)).toBe("");
    expect(phoneDigitsOnly(undefined)).toBe("");
  });
});

describe("normalizePhoneE164", () => {
  it("adds the country code to a bare 10-digit number", () => {
    expect(normalizePhoneE164("9981112233")).toBe("+529981112233");
  });

  it("passes through a full country-code + 10-digit number", () => {
    expect(normalizePhoneE164("529981112233")).toBe("+529981112233");
  });

  it("strips the legacy WhatsApp MX mobile '1' after the country code", () => {
    expect(normalizePhoneE164("5219981112233")).toBe("+529981112233");
  });

  it("strips a bare legacy '1' + 10-digit number", () => {
    expect(normalizePhoneE164("19981112233")).toBe("+529981112233");
  });

  it("normalizes formatting noise (spaces, dashes, parens)", () => {
    expect(normalizePhoneE164("+52 998-111-2233")).toBe("+529981112233");
  });

  it("returns empty string for empty/garbage input instead of guessing", () => {
    expect(normalizePhoneE164("")).toBe("");
    expect(normalizePhoneE164("12")).toBe("");
    expect(normalizePhoneE164(null)).toBe("");
  });
});

describe("samePhone", () => {
  it("matches EasyBroker's '+'-less phone on a merged contact", () => {
    expect(samePhone("523141255975", "+523141255975")).toBe(true);
  });

  it("matches the legacy MX mobile '1' variant", () => {
    expect(samePhone("+5213141255975", "+523141255975")).toBe(true);
  });

  it("never matches different or missing numbers", () => {
    expect(samePhone("+523141255976", "+523141255975")).toBe(false);
    expect(samePhone(undefined, "+523141255975")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });
});
