import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkCronSecret } from "@/lib/api-auth";
import { getDefaultCompanyId } from "@/lib/company";
import { sweepConversations } from "@/lib/services/conversation-processor.service";
import { ensureFreshCatalog } from "@/lib/services/property-catalog.service";

export const maxDuration = 120;

/**
 * Cada minuto (vercel.json): retoma conversaciones cuyo procesamiento en
 * after() se interrumpió, reintenta envíos pendientes, aplica la regla de
 * abandono y refresca el índice de propiedades cuando está viejo. Es la
 * garantía de procesamiento; after() solo es la vía rápida.
 */
export async function GET(request: NextRequest) {
  const authError = checkCronSecret(request);
  if (authError) return authError;

  const summary = await sweepConversations(90_000);
  const catalog = await ensureFreshCatalog(await getDefaultCompanyId());
  return NextResponse.json({ ok: true, ...summary, catalogSynced: catalog.synced, catalogError: catalog.error ?? null });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
