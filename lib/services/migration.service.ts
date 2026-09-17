import "server-only";
import crypto from "node:crypto";
import type { LeadInterestType, LeadStatus } from "@prisma/client";
import { getLeadRowsFresh, type LeadRow } from "@/lib/google-sheets";
import { createLead, findLeadByRequestId } from "@/lib/repositories/lead.repository";
import { normalizePhoneE164 } from "@/lib/phone";
import { logAuditEvent } from "@/lib/services/audit.service";

export interface ImportLeadsSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { lead: string; error: string }[];
}

/**
 * Historical rows have no stable id, so the dedup key is a deterministic
 * hash of the fields that together identify "the same submission" (Fase
 * 7): phone, its own recorded date, interest, property data, and origin.
 * Prefixed to keep it visually distinct from live-webhook requestIds.
 */
function fingerprintFromSheetRow(row: LeadRow): string {
  const raw = [row.telefono, row.fechaHora, row.tipoInteres, row.datoEnviado, row.origen].join("|");
  return "sheets:" + crypto.createHash("sha256").update(raw).digest("hex");
}

function classifyInterestType(raw: string): LeadInterestType {
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes("propiedad")) return "PROPERTY";
  if (normalized.includes("campa")) return "CAMPAIGN";
  if (normalized.includes("timeout")) return "TIMEOUT";
  if (normalized.includes("sin respuesta")) return "NO_RESPONSE";
  if (normalized.includes("explor")) return "EXPLORE";
  return "OTHER";
}

function classifyStatus(row: LeadRow): LeadStatus {
  if (row.asesorAsignado && row.estadoEnvioAsesor.toLowerCase().includes("enviad")) return "COMPLETED";
  if (row.asesorAsignado) return "ASSIGNED";
  if (row.estadoEasyBroker) return "CREATED_IN_EASYBROKER";
  return "RECEIVED";
}

/**
 * Fase 7: READ ONLY against Sheets, idempotent against Postgres (skips a
 * row whose fingerprint already exists as a Lead.requestId). Does NOT try
 * to resolve assignedAdvisorId — historic rows reference the old Sheets
 * advisor id/name, which doesn't map cleanly to the new Advisor.id: the
 * original advisor name is preserved in rawPayload for reference instead
 * of guessing a match (documented limitation, see
 * docs/MIGRATION_TO_DATABASE.md).
 */
export async function importLeadsFromSheets(companyId: string): Promise<ImportLeadsSummary> {
  const summary: ImportLeadsSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
  const rows = await getLeadRowsFresh();

  for (const row of rows) {
    const fingerprint = fingerprintFromSheetRow(row);
    try {
      const existing = await findLeadByRequestId(fingerprint);
      if (existing) {
        summary.skipped += 1;
        continue;
      }

      const createdAt = new Date(row.fechaHora);
      const phone = normalizePhoneE164(row.telefono) || row.telefono;

      await createLead({
        companyId,
        name: row.nombre,
        phone,
        interestType: classifyInterestType(row.tipoInteres),
        propertyData: row.datoEnviado || null,
        origin: row.origen || null,
        route: row.ruta || null,
        status: classifyStatus(row),
        source: "import_sheets",
        assignmentStatus: row.asesorAsignado ? "ASSIGNED" : "PENDING",
        requestId: fingerprint,
        createdAt: Number.isNaN(createdAt.getTime()) ? undefined : createdAt,
        rawPayload: row as never,
      });
      summary.created += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({
        lead: `${row.nombre || "sin nombre"} (${row.telefono || "sin teléfono"})`,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  await logAuditEvent({
    companyId,
    eventType: "MIGRATION_LEADS_IMPORTED",
    status: summary.errors.length > 0 ? "warning" : "ok",
    message: `Importación de leads: ${summary.created} creados, ${summary.skipped} omitidos.`,
    metadata: { ...summary },
  });

  return summary;
}
