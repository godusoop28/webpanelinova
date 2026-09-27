import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkCronSecret } from "@/lib/api-auth";
import { getDefaultCompanyId } from "@/lib/company";
import { runPropertyReportsCron } from "@/lib/services/property-report.service";

export const maxDuration = 60;

/**
 * Cada 15 minutos (vercel.json, UTC): el día y la hora se evalúan en la
 * zona configurada (America/Mexico_City). Solo encola el reporte semanal
 * si está habilitado y ya llegó la hora; la clave única por destinatario,
 * propiedad y periodo evita duplicados aunque corra varias veces. Además
 * procesa la cola de envíos (reportes y avisos de actividad) con reintentos.
 */
export async function GET(request: NextRequest) {
  const authError = checkCronSecret(request);
  if (authError) return authError;
  const result = await runPropertyReportsCron(await getDefaultCompanyId());
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
