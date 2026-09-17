import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { selectAdvisorForLead } from "@/lib/assignment";
import { appendMakeEvent } from "@/lib/google-sheets";
import { SelectAdvisorRequestSchema } from "@/lib/schemas";
import { env } from "@/lib/env";

const SCENARIO_LABEL = "Selección de asesor (ruleta)";

/**
 * LEGACY - remove after ManyChat migration (see docs/MIGRATION_TO_DATABASE.md).
 * The new pipeline (lib/services/lead.service.ts + lib/services/assignment.service.ts,
 * on Postgres) is what /api/webhooks/manychat/lead uses instead.
 *
 * Outbound endpoint Make will call to ask "which advisor gets this lead".
 * Only used for the rotation/comodín case — properties with an exclusive
 * advisor keep being resolved by EasyBroker, never by this endpoint. Same
 * shared-secret pattern as /api/integrations/make/events, since the caller
 * is a Make scenario rather than a signed-in panel user.
 */
export async function POST(request: NextRequest) {
  const providedSecret = request.headers.get("x-inova-secret");
  let expectedSecret: string;
  try {
    expectedSecret = env.make.webhookSecret;
  } catch {
    return NextResponse.json(
      { ok: false, error: "SERVER_MISCONFIGURED", message: "MAKE_WEBHOOK_SECRET no está configurado en el servidor." },
      { status: 500 }
    );
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED", message: "Secreto inválido." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_BODY", message: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const parsed = SelectAdvisorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "INVALID_BODY", message: "Payload inválido.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { ruta, telefono } = parsed.data;

  try {
    const result = await selectAdvisorForLead(ruta);

    if (!result.ok) {
      try {
        await appendMakeEvent({
          fecha: new Date().toISOString(),
          escenario: SCENARIO_LABEL,
          evento: "advisor_selection_failed",
          estado: "error",
          telefono,
          mensaje: `Sin asesores disponibles para la ruta "${ruta}".`,
        });
      } catch {
        // Logging failure must never mask the real response to Make.
      }

      return NextResponse.json(
        {
          ok: false,
          error: "NO_ADVISORS_AVAILABLE",
          message: "No hay asesores disponibles para esta ruta.",
        },
        { status: 404 }
      );
    }

    const { advisor } = result;

    try {
      await appendMakeEvent({
        fecha: new Date().toISOString(),
        escenario: SCENARIO_LABEL,
        evento: "advisor_selected",
        estado: "ejecutado",
        telefono,
        asesor: advisor.nombre,
      });
    } catch {
      // Same as above: non-fatal.
    }

    return NextResponse.json({
      ok: true,
      advisor: {
        id: advisor.id,
        nombre: advisor.nombre,
        whatsapp: advisor.whatsapp,
        emailEasyBroker: advisor.emailEasyBroker,
        manyChatId: advisor.manyChatId,
      },
      assignment: {
        type: "weighted",
        weight: advisor.peso,
        route: ruta,
      },
    });
  } catch (error) {
    console.error("[select-advisor] internal error", error);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "No se pudo completar la selección de asesor." },
      { status: 500 }
    );
  }
}
