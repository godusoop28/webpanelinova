import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDefaultCompanyId, DEFAULT_COMPANY_NAME } from "@/lib/company";
import { getReportData } from "@/lib/reporting/report-data";
import { listLeadRows } from "@/lib/services/lead-view.service";
import { ReportPdfDocument, type PdfLeadRow } from "@/lib/reporting/pdf-document";
import { buildReportFilename } from "@/lib/reporting/report-filename";
import { requireReportExportAccess, resolveExportDateRange, EXPORT_LEAD_CAP } from "@/lib/reporting/export";

export async function GET(request: NextRequest) {
  const authError = await requireReportExportAccess();
  if (authError) return authError;

  const resolved = resolveExportDateRange(request);
  if ("error" in resolved) return resolved.error;
  const { range } = resolved;

  try {
    const companyId = await getDefaultCompanyId();
    const [report, leadsPage] = await Promise.all([
      getReportData({ companyId, startDate: range.startDate, endDate: range.endDate }),
      listLeadRows({ companyId, from: range.startDate, to: range.endDate }, 1, EXPORT_LEAD_CAP),
    ]);

    const leads: PdfLeadRow[] = leadsPage.leads.map((lead) => ({
      fechaHora: lead.fechaHora,
      nombre: lead.nombre,
      telefono: lead.telefono,
      interestType: lead.interestType,
      origen: lead.origen,
      asesorAsignado: lead.asesorAsignado,
      estado: lead.estado,
    }));

    const pdfBuffer = await renderToBuffer(
      <ReportPdfDocument
        companyName={DEFAULT_COMPANY_NAME}
        report={report}
        periodLabel={range.label}
        generatedAt={new Date()}
        leads={leads}
        leadsTotal={leadsPage.total}
        leadsTruncated={leadsPage.total > leads.length}
      />
    );

    const filename = buildReportFilename(range, "pdf");
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/reports/pdf] Error generando PDF:", error instanceof Error ? error.message : error);
    return new NextResponse("No se pudo generar el PDF del reporte. Intenta de nuevo en unos segundos.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
