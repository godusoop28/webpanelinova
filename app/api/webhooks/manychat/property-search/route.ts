import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkIntegrationSecret } from "@/lib/api-auth";
import { PropertySearchWebhookSchema } from "@/lib/schemas";
import { searchProperties } from "@/lib/services/property-search.service";

/**
 * Fase 23: migration of "Buscar propiedades EasyBroker - búsqueda
 * profunda". Read-only against EasyBroker + OpenAI — never touches Sheets,
 * ManyChat, or the DB, so it's safe to enable independently of the lead
 * pipeline's shadow/live mode.
 */
export async function POST(request: NextRequest) {
  const authError = checkIntegrationSecret(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_BODY", message: "Cuerpo JSON inválido." } }, { status: 400 });
  }

  const parsed = PropertySearchWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BODY", message: "Payload inválido.", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  try {
    const result = await searchProperties(parsed.data.busqueda_propiedad);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "SEARCH_FAILED", message: error instanceof Error ? error.message : "Error desconocido" } },
      { status: 500 }
    );
  }
}
