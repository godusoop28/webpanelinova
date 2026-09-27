import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDefaultCompanyId } from "@/lib/company";
import { toCsv, UTF8_BOM } from "@/lib/reporting/csv";
import { mexicoCityDateKey, formatMexicoCityDateTime } from "@/lib/timezone";
import { NOT_IDENTIFIED, type SourceCount } from "@/lib/reporting/property-report";
import { requireReportExportAccess, resolveExportDateRange } from "@/lib/reporting/export";
import { dataSinceKey, listPropertyReport } from "@/lib/services/property-report.service";

const HEADER = [
  "Código",
  "Propiedad",
  "Leads únicos del periodo",
  "Acumulado",
  "Consultas",
  "Mensajes",
  "Portal del enlace",
  "Fuente declarada",
  "Fuente de adquisición",
  "Actividades del periodo",
  "Última actualización",
];

function sources(rows: SourceCount[]): string {
  return rows.map((s) => `${s.label}: ${s.contacts}`).join("; ") || NOT_IDENTIFIED;
}

/** Sin datos personales: solo métricas por propiedad. Mismos roles que ver /propiedades. */
export async function GET(request: NextRequest) {
  const authError = await requireReportExportAccess();
  if (authError) return authError;
  const url = new URL(request.url);
  if (!url.searchParams.get("range")) url.searchParams.set("range", "this_week");
  const resolved = resolveExportDateRange(new Request(url) as NextRequest);
  if ("error" in resolved) return resolved.error;
  const { range } = resolved;

  const companyId = await getDefaultCompanyId();
  const startKey = mexicoCityDateKey(range.startDate);
  const endKey = mexicoCityDateKey(range.endDate);
  const [rows, since] = await Promise.all([
    listPropertyReport({ companyId, startKey, endKey, search: url.searchParams.get("q") ?? undefined }),
    dataSinceKey(companyId),
  ]);
  const csv =
    UTF8_BOM +
    toCsv([
      [`Periodo ${startKey} a ${endKey}${since ? `; datos desde ${since}` : ""}`],
      HEADER,
      ...rows.map((row) => [
        row.publicId,
        row.title ?? "",
        String(row.periodLeads),
        String(row.cumulativeLeads),
        String(row.periodInquiries),
        String(row.periodMessages),
        sources(row.linkPortals),
        sources(row.declared),
        sources(row.acquisition),
        String(row.periodEvents),
        row.lastActivityAt ? formatMexicoCityDateTime(row.lastActivityAt) : "",
      ]),
    ]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="propiedades_${startKey}_${endKey}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
