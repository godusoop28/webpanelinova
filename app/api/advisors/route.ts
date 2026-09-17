import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRoleApi, unauthorizedResponse } from "@/lib/api-auth";
import { AdvisorInputSchema } from "@/lib/schemas";
import { getDefaultCompanyId } from "@/lib/company";
import { listAdvisorViews, createAdvisorFromInput } from "@/lib/services/advisor.service";

export async function GET() {
  const authResult = await requireRoleApi("ADMIN", "DIRECCION");
  if (!authResult.ok) return unauthorizedResponse(authResult);

  const companyId = await getDefaultCompanyId();
  const advisors = await listAdvisorViews(companyId);
  return NextResponse.json({ ok: true, advisors });
}

export async function POST(request: NextRequest) {
  const authResult = await requireRoleApi("ADMIN", "DIRECCION");
  if (!authResult.ok) return unauthorizedResponse(authResult);

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

  const companyId = await getDefaultCompanyId();
  const advisor = await createAdvisorFromInput(companyId, parsed.data);
  return NextResponse.json({ ok: true, advisor }, { status: 201 });
}
