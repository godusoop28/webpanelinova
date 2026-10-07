import Link from "next/link";
import { Bot, Info, Shield, Target, UserRound, UsersRound } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { env } from "@/lib/env";
import { BRAND_NAME } from "@/lib/brand";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { RolesOverview } from "@/components/roles-overview";

function safeRead(read: () => string): string | null {
  try {
    return read() || null;
  } catch {
    return null;
  }
}

const ROLE_LABELS = { ADMIN: "ADMIN", DIRECCION: "DIRECCIÓN", CONSULTA: "CONSULTA" } as const;

export default async function ConfiguracionPage() {
  const user = await requireRole("ADMIN");
  const fallbackAgentEmail = safeRead(() => env.easybroker.fallbackAgentEmail);

  return (
    <div className="space-y-5">
      <PageHeader title="Configuración" description="Organización, cuenta y reglas de asignación." />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <SectionHeader icon={UserRound} title="Mi cuenta" description="Datos de tu sesión y de la organización." />
            <div className="px-5 pb-5">
              <div className="overflow-hidden rounded-xl border border-ink-200">
                <div className="flex items-center gap-4 p-4">
                  <Avatar name={user.name ?? user.email} className="size-12 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-950">{user.name ?? "Sin nombre"}</p>
                    <p className="truncate text-sm text-ink-500">{user.email}</p>
                  </div>
                  <Badge tone="gold" className="rounded-md font-semibold">
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-2 border-t border-ink-100 bg-surface-muted px-4 py-3 text-sm">
                  <dt className="text-ink-500">Organización</dt>
                  <dd className="font-medium text-ink-900">{BRAND_NAME}</dd>
                  <dt className="text-ink-500">Rol en la cuenta</dt>
                  <dd className="font-medium text-ink-900">{ROLE_LABELS[user.role]}</dd>
                </dl>
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader icon={Target} title="Asignación de leads" description="Reglas del motor de asignación (solo lectura)." />
            <div className="space-y-3 px-5 pb-5">
              <div className="rounded-xl border border-ink-200 p-4">
                <p className="text-xs font-medium text-ink-600">Correo comodín de EasyBroker</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="min-w-0 break-all text-base font-medium text-ink-950">{fallbackAgentEmail ?? <span className="text-ink-500">No configurado</span>}</p>
                  {fallbackAgentEmail && <CopyButton value={fallbackAgentEmail} label="Copiar correo" />}
                </div>
                <p className="mt-1.5 text-xs text-ink-500">
                  Cuando una propiedad tiene este correo como agente, el lead pasa a la ruleta ponderada en vez de asignarse directo. Se define en la
                  configuración del servidor.
                </p>
              </div>
              <p className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
                <Info className="size-4 shrink-0 text-ink-500" aria-hidden />
                Pesos, límites diarios, rutas y pausas se administran en Asesores.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/asesores" className={buttonClass("secondary")}>
                  <UsersRound className="size-4" aria-hidden />
                  Administrar asesores
                </Link>
                <Link href="/conversaciones/ajustes" className={buttonClass("secondary")}>
                  <Bot className="size-4" aria-hidden />
                  Configurar asistente
                </Link>
              </div>
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <SectionHeader icon={Shield} title="Roles y permisos" description="Niveles de acceso según la autorización real del panel." />
          <div className="space-y-4 px-5 pb-5">
            <RolesOverview layout="list" />
            <Link href="/usuarios" className={buttonClass("secondary", "md", "w-full")}>
              <UsersRound className="size-4" aria-hidden />
              Ver usuarios
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
