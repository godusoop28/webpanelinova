import "server-only";

export type Role = "ADMIN" | "DIRECCION" | "CONSULTA";

export type PanelSection =
  | "dashboard"
  | "leads"
  | "conversaciones"
  | "asesores"
  | "reportes"
  | "propiedades"
  | "usuarios"
  | "integraciones"
  | "testing"
  | "configuracion";

const SECTION_ACCESS: Record<PanelSection, Role[]> = {
  dashboard: ["ADMIN", "DIRECCION", "CONSULTA"],
  leads: ["ADMIN", "DIRECCION"],
  conversaciones: ["ADMIN", "DIRECCION"],
  asesores: ["ADMIN", "DIRECCION"],
  reportes: ["ADMIN", "DIRECCION", "CONSULTA"],
  propiedades: ["ADMIN", "DIRECCION", "CONSULTA"],
  usuarios: ["ADMIN"],
  integraciones: ["ADMIN"],
  testing: ["ADMIN"],
  configuracion: ["ADMIN"],
};

export function canAccessSection(role: Role | undefined, section: PanelSection): boolean {
  if (!role) return false;
  return SECTION_ACCESS[section].includes(role);
}

export function isReadOnly(role: Role | undefined, section: PanelSection): boolean {
  if ((section === "reportes" || section === "propiedades") && role === "CONSULTA") return true;
  return false;
}

export function canManageUsers(role: Role | undefined): boolean {
  return role === "ADMIN";
}

export function canRunSync(role: Role | undefined): boolean {
  return role === "ADMIN";
}

/** Configuración del asistente y simulador: solo ADMIN. Operar conversaciones: ADMIN y DIRECCION. */
export function canConfigureAssistant(role: Role | undefined): boolean {
  return role === "ADMIN";
}

/** Destinatarios (datos del propietario) y actividades: ADMIN y DIRECCION. CONSULTA solo ve métricas. */
export function canManagePropertyFollowUp(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "DIRECCION";
}

/** Horario, flujos, plantillas y envíos de prueba: solo ADMIN. */
export function canConfigurePropertyReports(role: Role | undefined): boolean {
  return role === "ADMIN";
}

export function canEditAdvisors(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "DIRECCION";
}

/** Secciones a las que entra cada rol (fuente única para el menú y la pantalla de Configuración). */
export function sectionsForRole(role: Role): PanelSection[] {
  return (Object.keys(SECTION_ACCESS) as PanelSection[]).filter((section) => SECTION_ACCESS[section].includes(role));
}

export const ALL_SECTIONS: { section: PanelSection; label: string; href: string }[] = [
  { section: "dashboard", label: "Resumen", href: "/dashboard" },
  { section: "leads", label: "Leads", href: "/leads" },
  { section: "conversaciones", label: "Conversaciones", href: "/conversaciones" },
  { section: "asesores", label: "Asesores", href: "/asesores" },
  { section: "reportes", label: "Reportes", href: "/reportes" },
  { section: "propiedades", label: "Propiedades", href: "/propiedades" },
  { section: "usuarios", label: "Usuarios", href: "/usuarios" },
  { section: "integraciones", label: "Integraciones", href: "/integraciones" },
  { section: "configuracion", label: "Configuración", href: "/configuracion" },
  { section: "testing", label: "Diagnóstico interno", href: "/testing" },
];
