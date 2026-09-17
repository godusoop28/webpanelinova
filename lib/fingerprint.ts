import crypto from "node:crypto";
import { mexicoCityDateKey } from "@/lib/timezone";

/**
 * Deterministic idempotency key when ManyChat doesn't send its own request
 * id (Fase 15). No "server-only": pure and unit-testable. Bucketed by
 * Mexico City calendar day — see lib/services/webhook.service.ts for the
 * reasoning.
 */
export function buildLeadFingerprint(input: {
  phone: string;
  interestType: string;
  propertyData?: string;
  origen?: string;
  now?: Date;
}): string {
  const dayKey = mexicoCityDateKey(input.now ?? new Date());
  const raw = [input.phone, input.interestType, input.propertyData ?? "", input.origen ?? "", dayKey].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}
