"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FlaskConical,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessagesSquare,
  Plug,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/auth-actions";
import { initialsOf } from "@/components/ui/avatar";
import type { PanelSection, Role } from "@/lib/permissions";

const ICONS: Record<PanelSection, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  leads: UserRound,
  conversaciones: MessagesSquare,
  asesores: UsersRound,
  reportes: LineChart,
  propiedades: Building2,
  usuarios: ShieldCheck,
  integraciones: Plug,
  testing: FlaskConical,
  configuracion: Settings,
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  DIRECCION: "Dirección",
  CONSULTA: "Consulta",
};

interface NavItem {
  section: PanelSection;
  label: string;
  href: string;
}

/** Marca textual existente del panel (sin recrear logotipos de imagen). */
function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-c21-gold/40 text-[13px] font-bold tracking-tight text-c21-gold">
        C21
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-semibold tracking-wide text-c21-gold">CENTURY 21</p>
        <p className="truncate text-xs font-medium tracking-[0.2em] text-ink-300">INOVA</p>
      </div>
    </div>
  );
}

function SidebarBody({
  items,
  user,
  badges,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  user: { name: string | null; email: string; role: Role };
  badges: Partial<Record<PanelSection, number>>;
  pathname: string;
  onNavigate?: () => void;
}) {
  const displayName = user.name ?? user.email;
  return (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-thin" aria-label="Secciones">
        {items.map(({ section, label, href }) => {
          const Icon = ICONS[section];
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const badge = badges[section];
          return (
            <Link
              key={section}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                active ? "bg-accent-500 text-ink-950 shadow-sm" : "text-ink-200 hover:bg-sidebar-hover hover:text-white"
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", active ? "text-ink-950" : "text-ink-400")} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge ? (
                <span
                  className={cn(
                    "flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-5",
                    active ? "bg-ink-950/15 text-ink-950" : "bg-accent-500 text-ink-950"
                  )}
                  aria-label={`${badge} pendientes`}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-xs font-semibold text-ink-950">
            {initialsOf(displayName)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white" title={displayName}>
              {displayName}
            </p>
            <p className="truncate text-xs text-ink-400">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-300 transition-colors duration-150 hover:bg-sidebar-hover hover:text-white"
          >
            <LogOut className="size-[18px]" aria-hidden />
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
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
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Móvil y tablet: barra superior + cajón */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-sidebar px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex size-10 items-center justify-center rounded-lg text-ink-200 transition-colors hover:bg-sidebar-hover hover:text-white"
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Brand />
      </header>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="px-5 pb-5 pt-6">
          <Brand />
        </div>
        <SidebarBody items={items} user={user} badges={badges} pathname={pathname} />
      </aside>

      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cn("absolute inset-0 bg-ink-950/50 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <Brand />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-9 items-center justify-center rounded-lg text-ink-300 hover:bg-sidebar-hover hover:text-white"
              aria-label="Cerrar menú"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {open && <SidebarBody items={items} user={user} badges={badges} pathname={pathname} onNavigate={() => setOpen(false)} />}
        </div>
      </div>
    </>
  );
}
