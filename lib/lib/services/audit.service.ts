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
  | "AUTOMATION_SIMULATED"
  | "WEBHOOK_RECEIVED"
  | "WEBHOOK_DUPLICATE"
  | "WEBHOOK_REJECTED"
  | "PROPERTY_SEARCH"
  | "MIGRATION_ADVISORS_IMPORTED"
  | "MIGRATION_LEADS_IMPORTED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_PASSWORD_RESET"
  | "USER_DELETED"
  | "ADVISOR_CREATED"
  | "ADVISOR_UPDATED"
  | "ADVISOR_PAUSED"
  | "ADVISOR_RESUMED"
  | "LEAD_REASSIGNED"
  | "LEAD_STATUS_CHANGED"
  | "LEAD_RETRY_REQUESTED"
  | "INTEGRATION_JOB_RETRIED"
  | "INTEGRATION_JOB_FAILED";

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
 * failed audit write is logged to the console and swallowed rather than
 * thrown.
 */
export async function listRecentAuditLogs(companyId: string, limit = 25) {
  return prisma.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

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
