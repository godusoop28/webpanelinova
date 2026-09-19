import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDefaultCompanyId } from "@/lib/company";
import { listLeadRows } from "@/lib/services/lead-view.service";
import { toCsv, UTF8_BOM } from "@/lib/reporting/csv";
import { buildReportFilename } from "@/lib/reporting/report-filename";
import { toCanonicalRoute, ROUTE_LABELS } from "@/lib/reporting/report-aggregation";
import type { RawInterestType } from "@/lib/reporting/report-aggregation";
import { formatMexicoCityDateTime } from "@/lib/timezone";
import { requireReportExportAccess, resolveExportDateRange, EXPORT_LEAD_CAP } from "@/lib/reporting/export";

const HEADER = ["Fecha", "Cliente", "Teléfono", "Ruta", "Origen", "Asesor", "Estado", "EasyBroker", "ManyChat"];

export async function GET(request: NextRequest) {
  const authError = await requireReportExportAccess();
  if (authError) return authError;

  const resolved = resolveExportDateRange(request);
  if ("error" in resolved) return resolved.error;
  const { range } = resolved;

  try {
    const companyId = await getDefaultCompanyId();
    const leadsPage = await listLeadRows(
      { companyId, from: range.startDate, to: range.endDate },
      1,
      EXPORT_LEAD_CAP
    );

    const rows = leadsPage.leads.map((lead) => [
      formatMexicoCityDateTime(new Date(lead.fechaHora)),
      lead.nombre,
      lead.telefono,
      ROUTE_LABELS[toCanonicalRoute(lead.interestType as RawInterestType)],
      lead.origen,
      lead.asesorAsignado || "Sin asignar",
      lead.estado,
      lead.easyBrokerConfirmado ? "Confirmado" : "Pendiente",
      lead.manyChatNotificado ? "Enviada" : "Pendiente",
    ]);

    const csv = UTF8_BOM + toCsv([HEADER, ...rows]);
    const filename = buildReportFilename(range, "csv");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/reports/csv] Error generando CSV:", error instanceof Error ? error.message : error);
    return new NextResponse("No se pudo generar el CSV del reporte. Intenta de nuevo en unos segundos.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
