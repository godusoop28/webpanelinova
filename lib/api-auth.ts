import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import type { Role } from "@/lib/permissions";

/** Constant-time secret comparison (hashing first makes the lengths equal). */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Shared-secret gate for /api/webhooks/* — external systems (ManyChat)
 * call these without a panel session. Returns a ready-to-return
 * NextResponse on failure, or null when the caller should proceed.
 */
export function checkIntegrationSecret(request: NextRequest): NextResponse | null {
  const provided = request.headers.get("x-inova-secret");
  let expected: string;
  try {
    expected = env.integration.secret;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_MISCONFIGURED", message: "INTEGRATION_SECRET no está configurado en el servidor." } },
      { status: 500 }
    );
  }
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Secreto inválido." } }, { status: 401 });
  }
  return null;
}

/**
 * Panel-session gate for /api/admin/* and /api/advisors* JSON endpoints
 * (Fase 56). Mirrors lib/dal.ts's requireRole, but returns a result instead
 * of redirect()ing — a redirect to /login is useless to a fetch() caller
 * expecting JSON.
 */
export async function requireAdminApi(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  return requireRoleApi("ADMIN");
}

export async function requireRoleApi(
  ...roles: Role[]
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, status: 401, message: "No autenticado." };
  const role = session.user.role as Role | undefined;
  if (!role || !roles.includes(role)) {
    return { ok: false, status: 403, message: `Se requiere alguno de estos roles: ${roles.join(", ")}.` };
  }
  return { ok: true };
}

export function unauthorizedResponse(result: { status: number; message: string }): NextResponse {
  return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: result.message } }, { status: result.status });
}
