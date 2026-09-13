import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoModeActive } from "@/lib/env";
import {
  canAccessSection,
  type PanelSection,
  type Role,
} from "@/lib/permissions";

export interface SessionUser {
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
}

const DEMO_SESSION_USER: SessionUser = {
  name: "Demo Century 21 Inova",
  email: "demo@c21inova.com",
  image: null,
  role: "ADMIN",
};

/**
 * The real authorization boundary. Every protected page, layout, Server
 * Action, and Route Handler must call this (directly or via
 * requireSection) before touching Sheets/EasyBroker data — proxy.ts only
 * performs a fast, optimistic redirect and must never be relied on alone.
 *
 * Demo mode is active by default (see isDemoModeActive in lib/env.ts); while
 * it is, this skips the login check entirely and hands back a fixed ADMIN
 * identity, so the demo needs no password.
 */
export async function requireUser(): Promise<SessionUser> {
  if (isDemoModeActive()) {
    return DEMO_SESSION_USER;
  }
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }
  return {
    name: session.user.name ?? null,
    email: session.user.email,
    image: session.user.image ?? null,
    role: session.user.role,
  };
}

export async function requireSection(section: PanelSection): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccessSection(user.role, section)) {
    redirect("/dashboard");
  }
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
