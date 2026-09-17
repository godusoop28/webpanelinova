import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRoleApi, unauthorizedResponse } from "@/lib/api-auth";
import { UpdateLeadInputSchema } from "@/lib/schemas";
import { updateLeadStatus } from "@/lib/services/lead-management.service";
import { getLeadDetail } from "@/lib/services/lead-view.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: RouteParams) {
  const authResult = await requireRoleApi("ADMIN", "DIRECCION");
  if (!authResult.ok) return unauthorizedResponse(authResult);

  const { id } = await ctx.params;
  const detail = await getLeadDetail(id);
  if (!detail) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Lead no encontrado." } }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  const authResult = await requireRoleApi("ADMIN", "DIRECCION");
  if (!authResult.ok) return unauthorizedResponse(authResult);

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_BODY", message: "Cuerpo JSON inválido." } }, { status: 400 });
  }

  const parsed = UpdateLeadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BODY", message: "Datos inválidos.", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  if (!parsed.data.status) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_BODY", message: "status es obligatorio." } }, { status: 422 });
  }

  const lead = await updateLeadStatus(id, parsed.data.status);
  return NextResponse.json({ ok: true, lead });
}
