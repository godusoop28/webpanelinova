import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRoleApi, unauthorizedResponse } from "@/lib/api-auth";
import { ReassignLeadInputSchema } from "@/lib/schemas";
import { reassignLead } from "@/lib/services/lead-management.service";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authResult = await requireRoleApi("ADMIN", "DIRECCION");
  if (!authResult.ok) return unauthorizedResponse(authResult);

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_BODY", message: "Cuerpo JSON inválido." } }, { status: 400 });
  }

  const parsed = ReassignLeadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BODY", message: "Datos inválidos.", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  const result = await reassignLead(id, parsed.data.advisorId, parsed.data.reason);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: { code: "REASSIGN_FAILED", message: result.error } }, { status: 400 });
  }
  return NextResponse.json(result);
}
