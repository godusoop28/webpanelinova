import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login"];

/**
 * Optimistic session check only (reads the JWT cookie, no Sheets calls).
 * This is not the security boundary: every page, Server Action, and Route
 * Handler re-verifies the session and role server-side. See
 * lib/permissions.ts and the "requireUser"/"requireRole" helpers used
 * throughout app/(protected).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isPublicRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
