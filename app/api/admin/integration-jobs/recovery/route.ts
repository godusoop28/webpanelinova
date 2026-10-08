import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireAdminApi, unauthorizedResponse } from "@/lib/api-auth";
import { getDefaultCompanyId } from "@/lib/company";
import { buildManyChatRecoveryReport, executeManyChatRecovery } from "@/lib/services/integration-recovery.service";

/**
 * Recuperación selectiva de avisos MANYCHAT_FLOW.
 * GET: reporte en seco (no cambia nada ni llama a ManyChat).
 * POST: { requeue?: [jobId], close?: [jobId], confirm: true } ejecuta solo
 * esos trabajos tras revalidar su categoría. Nunca hay reenvío masivo.
 */
export async function GET() {
  const authResult = await requireAdminApi();
  if (!authResult.ok) return unauthorizedResponse(authResult);
  const report = await buildManyChatRecoveryReport(await getDefaultCompanyId());
  return NextResponse.json({ ok: true, dryRun: true, ...report });
}

const bodySchema = z.object({
  requeue: z.array(z.string().min(1)).max(50).optional(),
  close: z.array(z.string().min(1)).max(200).optional(),
  confirm: z.literal(true),
});

export async function POST(request: NextRequest) {
  const authResult = await requireAdminApi();
  if (!authResult.ok) return unauthorizedResponse(authResult);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BODY", message: "Envía { requeue?: string[], close?: string[], confirm: true } con IDs revisados en el reporte (GET)." } },
      { status: 400 }
    );
  }
  const session = await auth();
  const result = await executeManyChatRecovery(await getDefaultCompanyId(), parsed.data, session?.user?.email ?? "admin");
  return NextResponse.json({ ok: true, ...result });
}
