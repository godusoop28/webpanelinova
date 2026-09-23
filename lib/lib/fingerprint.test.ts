import { describe, it, expect } from "vitest";
import { buildLeadFingerprint } from "@/lib/fingerprint";

describe("buildLeadFingerprint", () => {
  const now = new Date("2026-03-10T18:00:00Z");

  it("is deterministic for the same input", () => {
    const input = { phone: "+529981112233", interestType: "Explorar", origen: "WhatsApp ManyChat", now };
    expect(buildLeadFingerprint(input)).toBe(buildLeadFingerprint(input));
  });

  it("changes when the phone changes", () => {
    const a = buildLeadFingerprint({ phone: "+529981112233", interestType: "Explorar", now });
    const b = buildLeadFingerprint({ phone: "+529981112234", interestType: "Explorar", now });
    expect(a).not.toBe(b);
  });

  it("changes when the interest type changes", () => {
    const a = buildLeadFingerprint({ phone: "+529981112233", interestType: "Explorar", now });
    const b = buildLeadFingerprint({ phone: "+529981112233", interestType: "Propiedad", now });
    expect(a).not.toBe(b);
  });

  it("changes when the property data changes (two different properties, same client)", () => {
    const a = buildLeadFingerprint({ phone: "+529981112233", interestType: "Propiedad", propertyData: "EB-1", now });
    const b = buildLeadFingerprint({ phone: "+529981112233", interestType: "Propiedad", propertyData: "EB-2", now });
    expect(a).not.toBe(b);
  });

  it("is stable within the same Mexico City calendar day even if the wall clock moves", () => {
    const morning = new Date("2026-03-10T13:00:00Z"); // 07:00 America/Mexico_City
    const evening = new Date("2026-03-10T23:00:00Z"); // 17:00 America/Mexico_City, same day
    const a = buildLeadFingerprint({ phone: "+529981112233", interestType: "Explorar", now: morning });
    const b = buildLeadFingerprint({ phone: "+529981112233", interestType: "Explorar", now: evening });
    expect(a).toBe(b);
  });

  it("changes across a Mexico City day boundary", () => {
    const day1 = new Date("2026-03-10T23:59:00Z"); // still 03-10 in Mexico City (UTC-6)
    const day2 = new Date("2026-03-11T07:00:00Z"); // 01:00 the next day in Mexico City
    const a = buildLeadFingerprint({ phone: "+529981112233", interestType: "Explorar", now: day1 });
    const b = buildLeadFingerprint({ phone: "+529981112233", interestType: "Explorar", now: day2 });
    expect(a).not.toBe(b);
  });
});
