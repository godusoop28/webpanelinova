/**
 * E.164-ish phone normalization for Mexican numbers. Distinct from
 * lib/metrics.ts's normalizePhone (digits-only, used for Sheets-era
 * dedup/search) — this one is for the new automation engine, where
 * EasyBroker/ManyChat/WhatsApp payloads disagree on whether "52" and a
 * legacy mobile "1" prefix are present, and the DB needs one canonical
 * shape to key on. No "server-only": used by both server code and tests.
 */

const DEFAULT_COUNTRY_CODE = "52";

export function phoneDigitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Best-effort normalization to "+52XXXXXXXXXX". Never throws — malformed
 * input returns "" rather than a wrong-but-plausible number, so callers can
 * treat "" as "couldn't normalize" instead of silently misrouting a lead.
 */
export function normalizePhoneE164(raw: string | null | undefined, defaultCountryCode = DEFAULT_COUNTRY_CODE): string {
  let digits = phoneDigitsOnly(raw);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.length === 10) {
    // Bare local number, no country code.
    digits = defaultCountryCode + digits;
  } else if (digits.length === 11 && digits.startsWith("1") && defaultCountryCode === "52") {
    // Legacy WhatsApp MX mobile format: "1" + 10-digit number, no country code.
    digits = defaultCountryCode + digits.slice(1);
  } else if (
    digits.length === 10 + defaultCountryCode.length + 1 &&
    digits.startsWith(defaultCountryCode + "1")
  ) {
    // Country code + legacy "1" mobile marker + 10-digit number.
    digits = defaultCountryCode + digits.slice(defaultCountryCode.length + 1);
  } else if (digits.length !== 10 + defaultCountryCode.length) {
    // Doesn't match any known shape — don't guess.
    if (digits.length < 10 || digits.length > 15) return "";
  }

  return `+${digits}`;
}
