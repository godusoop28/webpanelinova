import { Crown, FileText, UsersRound, type LucideIcon } from "lucide-react";
import { ALL_SECTIONS, sectionsForRole, type Role } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";

const ROLES: { role: Role; label: string; icon: LucideIcon; scope: string; tone: "neutral" | "gold" | "info"; notes: string[] }[] = [
  {
    role: "ADMIN",
    label: "ADMIN",
    icon: Crown,
    scope: "Acceso total",
    tone: "neutral",
    notes: ["Configura el asistente, el simulador y el reporte de los viernes."],
  },
  {
    role: "DIRECCION",
    label: "DIRECCIÓN",
    icon: UsersRound,
    scope: "Gestión",
    tone: "gold",
    notes: ["Opera conversaciones (pausar/reanudar IA) y administra asesores.", "Gestiona destinatarios y actividades de propiedades."],
  },
  {
    role: "CONSULTA",
    label: "CONSULTA",
    icon: FileText,
    scope: "Solo lectura",
    tone: "info",
    notes: ["Reportes y propiedades en modo lectura."],
  },
];

/** Roles y alcance calculados desde lib/permissions.ts (la autorización real), no descripciones fijas. */
export function RolesOverview({ layout = "grid" }: { layout?: "grid" | "list" }) {
  const labelOf = new Map(ALL_SECTIONS.map((s) => [s.section, s.label]));
  return (
    <div className={layout === "grid" ? "grid grid-cols-1 gap-4 md:grid-cols-3" : "space-y-3"}>
      {ROLES.map(({ role, label, icon: Icon, scope, tone, notes }) => (
        <div key={role} className="flex gap-3 rounded-xl border border-ink-200 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
            <Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold tracking-wide text-ink-950">{label}</p>
              <Badge tone={tone}>{scope}</Badge>
            </div>
            <p className="text-xs leading-relaxed text-ink-600">
              Secciones: {sectionsForRole(role).filter((section) => section !== "testing").map((section) => labelOf.get(section)).join(", ")}.
            </p>
            {notes.map((note) => (
              <p key={note} className="text-xs leading-relaxed text-ink-500">
                {note}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
