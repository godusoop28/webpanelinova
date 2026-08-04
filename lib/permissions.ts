import "server-only";

export type Role = "ADMIN" | "DIRECCION" | "CONSULTA";

export type PanelSection =
  | "dashboard"
  | "leads"
  | "propiedades"
  | "asesores"
  | "reportes"
  | "usuarios"
  | "integraciones"
  | "configuracion";

const SECTION_ACCESS: Record<PanelSection, Role[]> = {
  dashboard: ["ADMIN", "DIRECCION", "CONSULTA"],
  leads: ["ADMIN", "DIRECCION"],
  propiedades: ["ADMIN", "DIRECCION"],
  asesores: ["ADMIN", "DIRECCION"],
  reportes: ["ADMIN", "DIRECCION", "CONSULTA"],
  usuarios: ["ADMIN"],
  integraciones: ["ADMIN"],
  configuracion: ["ADMIN"],
};

export function canAccessSection(role: Role | undefined, section: PanelSection): boolean {
  if (!role) return false;
  return SECTION_ACCESS[section].includes(role);
}

export function isReadOnly(role: Role | undefined, section: PanelSection): boolean {
  if (section === "reportes" && role === "CONSULTA") return true;
  return false;
}

export function canManageUsers(role: Role | undefined): boolean {
  return role === "ADMIN";
}

export function canRunSync(role: Role | undefined): boolean {
  return role === "ADMIN";
}

export function canEditAdvisors(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "DIRECCION";
}

export const ALL_SECTIONS: { section: PanelSection; label: string; href: string }[] = [
  { section: "dashboard", label: "Resumen", href: "/dashboard" },
  { section: "leads", label: "Leads", href: "/leads" },
  { section: "propiedades", label: "Propiedades", href: "/propiedades" },
  { section: "asesores", label: "Asesores", href: "/asesores" },
  { section: "reportes", label: "Reportes", href: "/reportes" },
  { section: "usuarios", label: "Usuarios", href: "/usuarios" },
  { section: "integraciones", label: "Integraciones", href: "/integraciones" },
  { section: "configuracion", label: "Configuración", href: "/configuracion" },
];
