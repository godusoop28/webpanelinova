import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { processDueIntegrationJobs } from "@/lib/services/retry.service";

/**
 * Fase 20: picks up EasyBroker/ManyChat calls that failed and retries them
 * with backoff (1min, 5min, 15min, 1h). See vercel.json for the schedule —
 * Vercel Cron invokes this automatically and, when the project's env var is
 * named exactly CRON_SECRET, injects it itself as "Authorization: Bearer
 * <value>" (no secret embedded in vercel.json). "x-cron-secret" / "?secret="
 * stay supported for any other scheduler (cron-job.org, etc.).
 */
function checkCronSecret(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : undefined;
  const provided = bearerToken ?? request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");
  let expected: string;
  try {
    expected = env.cron.secret;
  } catch {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no está configurado." }, { status: 500 });
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Secreto inválido." }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = checkCronSecret(request);
  if (authError) return authError;

  const summary = await processDueIntegrationJobs();
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
