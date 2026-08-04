"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Plug,
  Settings,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/auth-actions";
import type { PanelSection, Role } from "@/lib/permissions";

const ICONS: Record<PanelSection, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  leads: Users,
  propiedades: Building2,
  asesores: UserSquare2,
  reportes: LineChart,
  usuarios: Users,
  integraciones: Plug,
  configuracion: Settings,
};

interface NavItem {
  section: PanelSection;
  label: string;
  href: string;
}

export function Sidebar({
  items,
  user,
}: {
  items: NavItem[];
  user: { name: string | null; email: string; role: Role };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold tracking-tight text-gold-400">
          C21
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-ink-900">Century 21 Inova</p>
          <p className="text-xs text-ink-500">Panel administrativo</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 scrollbar-thin">
        {items.map(({ section, label, href }) => {
          const Icon = ICONS[section];
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={section}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-700">
            {(user.name ?? user.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-ink-900">
              {user.name ?? user.email}
            </p>
            <p className="truncate text-xs text-ink-500">{user.role}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <LogOut className="size-4" aria-hidden />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 flex size-10 items-center justify-center rounded-lg border border-ink-200 bg-surface shadow-card lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <aside className="hidden w-64 shrink-0 border-r border-ink-100 bg-surface lg:flex">
        {content}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-surface shadow-card-hover">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
              aria-label="Cerrar menú"
            >
              <X className="size-5" aria-hidden />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
