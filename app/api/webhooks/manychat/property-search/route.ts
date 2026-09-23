import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { checkIntegrationSecret } from "@/lib/api-auth";
import { PropertySearchWebhookSchema } from "@/lib/schemas";
import { searchProperties } from "@/lib/services/property-search.service";
import type { PropertySearchOption } from "@/lib/property-search-schema";
import { logAuditEvent } from "@/lib/services/audit.service";
import { getDefaultCompanyId } from "@/lib/company";

/**
 * Read-only against EasyBroker + OpenAI — never touches ManyChat, and its
 * only DB write is the PROPERTY_SEARCH audit row (after the response), so
 * it's safe to enable independently of the lead pipeline's shadow/live
 * mode.
 *
 * Response shape is flat (opcion_1_id/opcion_1_titulo/opcion_1_url, ...)
 * rather than an `opciones` array on purpose: it matches exactly what the
 * ManyChat flow's External Request step already maps into
 * Opcion_1_Titulo/Opcion_2_Titulo/etc. (same contract the old Make webhook
 * used), so pointing ManyChat at this URL doesn't require touching its
 * field mappings.
 */
function flattenOptions(opciones: PropertySearchOption[]) {
  const slots = [0, 1, 2] as const;
  const flat: Record<string, string> = {};
  for (const i of slots) {
    const option = opciones[i];
    flat[`opcion_${i + 1}_id`] = option?.id ?? "";
    flat[`opcion_${i + 1}_titulo`] = option?.titulo ?? "";
    flat[`opcion_${i + 1}_url`] = option?.url ?? "";
  }
  return flat;
}

export async function POST(request: NextRequest) {
  const authError = checkIntegrationSecret(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ resultado: "error", mensaje: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const parsed = PropertySearchWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { resultado: "error", mensaje: "Payload inválido.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const query = parsed.data.busqueda_propiedad;
  const startedAt = Date.now();
  try {
    const result = await searchProperties(query);
    const elapsedMs = Date.now() - startedAt;
    after(async () =>
      logAuditEvent({
        companyId: await getDefaultCompanyId(),
        eventType: "PROPERTY_SEARCH",
        status: result.opciones.length > 0 ? (result.metodo === "keyword" ? "warning" : "ok") : "warning",
        message: `Búsqueda "${query}": ${result.resultado} (${result.opciones.length} opciones, ${result.metodo ?? "-"}, ${elapsedMs} ms).`,
        metadata: { query, elapsedMs, ...result },
      })
    );
    return NextResponse.json({ resultado: result.resultado, ...flattenOptions(result.opciones) });
  } catch (error) {
    // Mirrors the old Make webhook: always 200 so ManyChat's flow doesn't
    // hit a request-failure branch — the client sees "sin resultados"
    // either way, and the real error is in the server logs / AuditLog.
    console.error("[PROPERTY_SEARCH] búsqueda falló", error);
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Error desconocido";
    after(async () =>
      logAuditEvent({
        companyId: await getDefaultCompanyId(),
        eventType: "PROPERTY_SEARCH",
        status: "error",
        message: `Búsqueda "${query}" falló tras ${elapsedMs} ms: ${message}`,
        metadata: { query, elapsedMs, error: message },
      })
    );
    return NextResponse.json({ resultado: "sin_resultados", ...flattenOptions([]) });
  }
}
