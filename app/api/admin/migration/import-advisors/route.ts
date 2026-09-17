import { NextResponse } from "next/server";
import { requireAdminApi, unauthorizedResponse } from "@/lib/api-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { importAdvisorsFromSheets } from "@/lib/services/advisor.service";

/**
 * Fase 6: one-shot, re-runnable import from the legacy "Asesores" sheet
 * into Postgres. READ ONLY against Sheets (never writes back) and
 * idempotent against the DB (upsert keyed on easyBrokerEmail).
 */
export async function POST() {
  const authResult = await requireAdminApi();
  if (!authResult.ok) return unauthorizedResponse(authResult);

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "DATABASE_NOT_CONFIGURED", message: "DATABASE_URL no está configurada." } },
      { status: 503 }
    );
  }

  try {
    const companyId = await getDefaultCompanyId();
    const summary = await importAdvisorsFromSheets(companyId);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "IMPORT_FAILED", message: error instanceof Error ? error.message : "Error desconocido" } },
      { status: 500 }
    );
  }
}
