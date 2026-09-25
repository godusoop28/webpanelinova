import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRoleApi, unauthorizedResponse } from "@/lib/api-auth";
import { AdvisorInputSchema } from "@/lib/schemas";
import { getAdvisorView, updateAdvisorFromInput, setAdvisorActiveState } from "@/lib/services/advisor.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: RouteParams) {
  const authResult = await requireRoleApi("ADMIN", "DIRECCION");
  if (!authResult.ok) return unauthorizedResponse(authResult);

  const { id } = await ctx.params;
  const advisor = await getAdvisorView(id);
  if (!advisor) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Asesor no encontrado." } }, { status: 404 });
  }
  return NextResponse.json({ ok: true, advisor });
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

  const parsed = AdvisorInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BODY", message: "Datos inválidos.", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  if (!(await getAdvisorView(id))) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Asesor no encontrado." } }, { status: 404 });
  }

  const advisor = await updateAdvisorFromInput(id, parsed.data);
  return NextResponse.json({ ok: true, advisor });
}

/** Fase 11: soft-delete only — sets active=false, never a physical DELETE. */
export async function DELETE(_request: NextRequest, ctx: RouteParams) {
  const authResult = await requireRoleApi("ADMIN", "DIRECCION");
  if (!authResult.ok) return unauthorizedResponse(authResult);

  const { id } = await ctx.params;
  if (!(await getAdvisorView(id))) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Asesor no encontrado." } }, { status: 404 });
  }
  const advisor = await setAdvisorActiveState(id, false);
  return NextResponse.json({ ok: true, advisor });
}
