import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { appendMakeEvent } from "@/lib/google-sheets";
import { MakeEventPayloadSchema } from "@/lib/schemas";
import { env } from "@/lib/env";

/**
 * Inbound webhook: Make calls this endpoint to log automation events into
 * the EventosMake sheet. Protected with a shared secret rather than a user
 * session, since the caller is a Make scenario, not a signed-in person.
 */
export async function POST(request: NextRequest) {
  const providedSecret = request.headers.get("x-inova-secret");
  let expectedSecret: string;
  try {
    expectedSecret = env.make.webhookSecret;
  } catch {
    return NextResponse.json(
      { error: "MAKE_WEBHOOK_SECRET no está configurado en el servidor." },
      { status: 500 }
    );
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Secreto inválido." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const parsed = MakeEventPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  await appendMakeEvent({
    fecha: new Date().toISOString(),
    ...parsed.data,
  });

  return NextResponse.json({ ok: true });
}
