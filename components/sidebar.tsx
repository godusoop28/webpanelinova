"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessagesSquare,
  Plug,
  Settings,
  ShieldCheck,
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
  conversaciones: MessagesSquare,
  asesores: UserSquare2,
  reportes: LineChart,
  propiedades: Building2,
  usuarios: ShieldCheck,
  integraciones: Plug,
  testing: FlaskConical,
  configuracion: Settings,
};

const GROUPS: { label: string; sections: PanelSection[] }[] = [
  { label: "Principal", sections: ["dashboard", "conversaciones", "leads", "propiedades"] },
  { label: "Equipo", sections: ["asesores", "reportes"] },
  { label: "Administración", sections: ["usuarios", "integraciones", "configuracion", "testing"] },
];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  DIRECCION: "Dirección",
  CONSULTA: "Consulta",
};

const COLLAPSE_KEY = "inova.sidebar.collapsed";

interface NavItem {
  section: PanelSection;
  label: string;
  href: string;
}

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold tracking-tight text-c21-gold">
        C21
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-ink-900">Century 21 Inova</p>
          <p className="truncate text-xs text-ink-500">Panel administrativo</p>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  items,
  user,
  badges = {},
}: {
  items: NavItem[];
  user: { name: string | null; email: string; role: Role };
  badges?: Partial<Record<PanelSection, number>>;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // sin almacenamiento: queda expandido
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        // ignorar
      }
      return !value;
    });
  }

  const byKey = new Map(items.map((item) => [item.section, item]));
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  const nav = (compact: boolean) => (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2 scrollbar-thin">
      {GROUPS.map((group) => {
        const groupItems = group.sections.map((section) => byKey.get(section)).filter((item): item is NavItem => Boolean(item));
        if (groupItems.length === 0) return null;
        return (
          <div key={group.label} className="space-y-0.5">
            {compact ? (
              <div className="mx-2 mb-2 border-t border-ink-100" aria-hidden />
            ) : (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{group.label}</p>
            )}
            {groupItems.map(({ section, label, href }) => {
              const Icon = ICONS[section];
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const badge = badges[section];
              return (
                <Link
                  key={section}
                  href={href}
                  onClick={() => setOpen(false)}
                  title={compact ? label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    compact && "justify-center px-0",
                    active ? "bg-accent-50 text-accent-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                  )}
                >
                  <Icon className={cn("size-[18px] shrink-0", active ? "text-accent-600" : "text-ink-400 group-hover:text-ink-600")} aria-hidden />
                  {!compact && <span className="flex-1 truncate">{label}</span>}
                  {badge ? (
                    <span
                      className={cn(
                        "flex min-w-5 items-center justify-center rounded-full bg-accent-600 px-1.5 text-[11px] font-semibold leading-5 text-white",
                        compact && "absolute -right-1 -top-1 min-w-4 px-1 text-[10px] leading-4"
                      )}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const footer = (compact: boolean) => (
    <div className="border-t border-ink-100 p-3">
      <div className={cn("flex items-center gap-3 rounded-lg px-2 py-2", compact && "justify-center px-0")}>
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700"
          title={compact ? `${user.name ?? user.email} · ${ROLE_LABELS[user.role]}` : undefined}
        >
          {initials}
        </div>
        {!compact && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-ink-900">{user.name ?? user.email}</p>
            <p className="truncate text-xs text-ink-500">{ROLE_LABELS[user.role]}</p>
          </div>
        )}
        {!compact && (
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex size-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        )}
      </div>
      {compact && (
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center justify-center rounded-lg py-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </form>
      )}
    </div>
  );

  return (
    <>
      {/* Barra superior en móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-surface/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-ink-100 active:scale-95"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Logo />
      </header>

      {/* Escritorio */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-ink-200 bg-surface transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        <div className={cn("flex h-16 items-center justify-between gap-2 px-4", collapsed && "justify-center px-0")}>
          <Logo compact={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex size-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              aria-label="Contraer menú"
              title="Contraer menú"
            >
              <ChevronsLeft className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mx-auto mb-2 flex size-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            aria-label="Expandir menú"
            title="Expandir menú"
          >
            <ChevronsRight className="size-4" aria-hidden />
          </button>
        )}
        {nav(collapsed)}
        {footer(collapsed)}
      </aside>

      {/* Cajón en móvil */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cn("absolute inset-0 bg-ink-950/40 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-card-hover transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-14 items-center justify-between px-4">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
              aria-label="Cerrar menú"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {nav(false)}
          {footer(false)}
        </div>
      </div>
    </>
  );
}
