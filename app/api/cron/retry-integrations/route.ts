import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { processDueIntegrationJobs } from "@/lib/services/retry.service";

/**
 * Fase 20: picks up EasyBroker/ManyChat calls that failed and retries them
 * with backoff (1min, 5min, 15min, 1h). Point Vercel Cron (or any scheduler)
 * here with the header below — GET so it works from a plain cron trigger.
 */
function checkCronSecret(request: NextRequest): NextResponse | null {
  const provided = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");
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
