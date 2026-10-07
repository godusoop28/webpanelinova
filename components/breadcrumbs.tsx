"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const SECTION_LABELS: Record<string, string> = {
  dashboard: "Resumen",
  leads: "Leads",
  conversaciones: "Conversaciones",
  asesores: "Asesores",
  reportes: "Reportes",
  propiedades: "Propiedades",
  usuarios: "Usuarios",
  integraciones: "Integraciones",
  testing: "Diagnóstico interno",
  configuracion: "Configuración",
};

const SUB_LABELS: Record<string, Record<string, string>> = {
  conversaciones: { simulador: "Simulador", ajustes: "Configuración del asistente", asesor: "Asesor" },
  propiedades: { configuracion: "Reporte de los viernes" },
};

function crumbsFor(pathname: string): { label: string; href?: string }[] {
  const [section, sub, extra] = pathname.split("/").filter(Boolean);
  if (!section || !SECTION_LABELS[section]) return [];
  const crumbs: { label: string; href?: string }[] = [{ label: SECTION_LABELS[section], href: sub ? `/${section}` : undefined }];
  if (sub) {
    const known = SUB_LABELS[section]?.[sub];
    if (known) crumbs.push({ label: known });
    else if (section === "propiedades") crumbs.push({ label: decodeURIComponent(sub) });
    else crumbs.push({ label: section === "conversaciones" ? "Conversación" : "Detalle" });
    if (extra && section === "conversaciones" && sub === "asesor") crumbs[crumbs.length - 1] = { label: "Chat con asesor" };
  }
  return crumbs;
}

export function Breadcrumbs() {
  const crumbs = crumbsFor(usePathname());
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Ruta de navegación" className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-500">
      <Link href="/dashboard" className="flex items-center gap-1.5 rounded transition-colors hover:text-ink-900">
        <Home className="size-3.5" aria-hidden />
        <span>Inicio</span>
      </Link>
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="size-3.5 shrink-0 text-ink-400" aria-hidden />
          {crumb.href ? (
            <Link href={crumb.href} className="truncate rounded transition-colors hover:text-ink-900">
              {crumb.label}
            </Link>
          ) : (
            <span className="truncate font-medium text-ink-800" aria-current="page">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
