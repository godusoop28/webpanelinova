import "server-only";
import { prisma } from "@/lib/db";

/** Fase 34's catalog. Kept as a union rather than a Prisma enum so a new
 * event type never needs a migration — AuditLog.eventType is a plain string
 * column. */
export type AuditEventType =
  | "LEAD_RECEIVED"
  | "LEAD_DUPLICATE_SKIPPED"
  | "PROPERTY_FETCHED"
  | "PROPERTY_FETCH_FAILED"
  | "ADVISOR_DIRECT_MATCH"
  | "ADVISOR_ROTATION_SELECTED"
  | "ADVISOR_SELECTION_FAILED"
  | "EASYBROKER_CONTACT_REQUEST_CREATED"
  | "EASYBROKER_CONTACT_REQUEST_FAILED"
  | "EASYBROKER_CONTACT_FOUND"
  | "EASYBROKER_CONTACT_NOT_FOUND"
  | "EASYBROKER_CONTACT_ASSIGNED"
  | "EASYBROKER_ASSIGNMENT_FAILED"
  | "MANYCHAT_CUSTOM_FIELDS_UPDATED"
  | "MANYCHAT_NOTIFICATION_SENT"
  | "MANYCHAT_NOTIFICATION_FAILED"
  | "LEAD_COMPLETED"
  | "LEAD_FAILED"
  | "RETRY_SCHEDULED"
  | "SHADOW_ACTION_SKIPPED"
  | "WEBHOOK_RECEIVED"
  | "WEBHOOK_DUPLICATE"
  | "MIGRATION_ADVISORS_IMPORTED"
  | "MIGRATION_LEADS_IMPORTED";

export interface AuditEventInput {
  companyId?: string;
  leadId?: string;
  advisorId?: string;
  eventType: AuditEventType;
  status: "ok" | "error" | "warning" | "skipped";
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Logging must never mask the real outcome of whatever it's auditing — a
 * failed audit write is logged to the console and swallowed, same pattern
 * the legacy appendMakeEvent callers already used (lib/google-sheets.ts).
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        leadId: input.leadId,
        advisorId: input.advisorId,
        eventType: input.eventType,
        status: input.status,
        message: input.message,
        metadata: input.metadata as never,
      },
    });
  } catch (error) {
    console.error("[AUDIT] failed to write audit log", input.eventType, error);
  }
}
