"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { BarChart3, Mail, MessagesSquare, Pause, Pencil, Phone, Play, Power, Route, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ActionMenu } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/sheet";
import { FormMessage, inputClass } from "@/components/ui/field";
import { AdvisorForm, routeLabel } from "@/components/asesores/advisor-form";
import { isPaused as computeIsPaused, PAUSE_INDEFINITE, priorityLabelForWeight } from "@/lib/advisors";
import { formatMexicoCityDateTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { AdvisorView } from "@/lib/types";
import {
  pauseAdvisorAction,
  resumeAdvisorAction,
  toggleAdvisorAction,
  updateAdvisorAction,
  type AdvisorFormState,
} from "@/app/(protected)/asesores/actions";

const pauseInitialState: AdvisorFormState = {};

export type Availability = "available" | "paused" | "inactive";

export function availabilityOf(advisor: AdvisorView, now: Date): Availability {
  if (!advisor.activo) return "inactive";
  return computeIsPaused(advisor, now) ? "paused" : "available";
}

function PausePanel({ id, onDone }: { id: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(pauseAdvisorAction.bind(null, id), pauseInitialState);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-800">Pausar recepción de leads</p>
        <button type="button" onClick={onDone} className="rounded p-1 text-ink-500 hover:bg-amber-100" aria-label="Cancelar pausa">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="mode" value="1h" variant="secondary" size="sm" loading={pending}>
          1 hora
        </Button>
        <Button type="submit" name="mode" value="tomorrow_9am" variant="secondary" size="sm" loading={pending}>
          Hasta mañana 9:00
        </Button>
        <Button type="submit" name="mode" value="indefinite" variant="secondary" size="sm" loading={pending}>
          Indefinidamente
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" name="customDateTime" aria-label="Pausar hasta" className={cn(inputClass, "h-9 w-auto py-1 text-xs")} />
        <Button type="submit" name="mode" value="custom" variant="secondary" size="sm" loading={pending}>
          Pausar hasta esa fecha
        </Button>
      </div>
      <FormMessage error={state.error} />
    </form>
  );
}

export function AdvisorRow({ advisor, leadsHoy }: { advisor: AdvisorView; leadsHoy: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [isToggling, startToggle] = useTransition();
  const [isResuming, startResume] = useTransition();

  const availability = availabilityOf(advisor, new Date());
  const boundUpdateAction = updateAdvisorAction.bind(null, advisor.id, advisor.pausadoHasta);

  const status =
    availability === "inactive" ? (
      <Badge tone="neutral" dot>
        Inactivo
      </Badge>
    ) : availability === "paused" ? (
      <Badge tone="warning" dot title="No recibe leads mientras esté en pausa">
        {advisor.pausadoHasta === PAUSE_INDEFINITE ? "En pausa indefinida" : `En pausa hasta ${formatMexicoCityDateTime(new Date(advisor.pausadoHasta ?? ""))}`}
      </Badge>
    ) : (
      <Badge tone="success" dot title="Disponible para recibir leads">
        Disponible
      </Badge>
    );

  return (
    <Card className={cn("flex flex-col p-5", availability === "inactive" && "bg-surface-muted")}>
      <div className="flex items-start gap-3">
        <Avatar name={advisor.nombre || "?"} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink-950" title={advisor.nombre}>
            {advisor.nombre || "—"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {status}
            <Badge tone="gold">Prioridad: {priorityLabelForWeight(advisor.peso)}</Badge>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-4">
        <dl className="min-w-0 space-y-2 text-sm">
          <div className="flex items-center gap-2.5 text-ink-700">
            <dt>
              <Phone className="size-4 text-ink-400" aria-label="WhatsApp" />
            </dt>
            <dd className="truncate">{advisor.whatsapp || "—"}</dd>
          </div>
          <div className="flex items-center gap-2.5 text-ink-700">
            <dt>
              <Mail className="size-4 text-ink-400" aria-label="Email de EasyBroker" />
            </dt>
            <dd className="truncate" title={advisor.emailEasyBroker}>
              {advisor.emailEasyBroker || <span className="text-ink-400">Sin email de EasyBroker</span>}
            </dd>
          </div>
          <div className="flex items-center gap-2.5 text-ink-700">
            <dt>
              <MessagesSquare className="size-4 text-ink-400" aria-label="ManyChat ID" />
            </dt>
            <dd className="truncate">
              {advisor.manyChatId ? (
                <span className="text-ink-600">ManyChat {advisor.manyChatId}</span>
              ) : (
                <span className="text-amber-700">Sin ManyChat ID (no recibe avisos)</span>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-2.5 text-ink-700">
            <dt>
              <Route className="mt-0.5 size-4 text-ink-400" aria-label="Rutas" />
            </dt>
            <dd className="flex flex-wrap gap-1">
              {advisor.rutasPermitidas.length === 0 ? (
                <Badge tone="neutral">Todas las rutas</Badge>
              ) : (
                advisor.rutasPermitidas.map((route) => (
                  <Badge key={route} tone="neutral">
                    {routeLabel(route)}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        </dl>
        <div className="border-l border-ink-100 pl-4 text-right">
          <BarChart3 className="ml-auto size-4 text-accent-600" aria-hidden />
          <p className="mt-1 text-xs text-ink-500">Leads hoy</p>
          <p className="text-lg font-semibold tabular-nums text-ink-950">{leadsHoy}</p>
          <p className="text-xs text-ink-500">{advisor.limiteDiario !== null ? `de ${advisor.limiteDiario}` : "Sin límite"}</p>
        </div>
      </div>

      {advisor.observaciones && <p className="mt-3 line-clamp-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">{advisor.observaciones}</p>}

      {pausing && (
        <div className="mt-3">
          <PausePanel id={advisor.id} onDone={() => setPausing(false)} />
        </div>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 pt-4">
        {availability === "paused" && (
          <Button variant="secondary" size="sm" loading={isResuming} onClick={() => startResume(() => resumeAdvisorAction(advisor.id))}>
            <Play className="size-3.5" aria-hidden />
            Reanudar
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>
        <ActionMenu
          label={`Más acciones para ${advisor.nombre}`}
          items={[
            ...(availability === "available" ? [{ label: "Pausar", icon: Pause, onSelect: () => setPausing(true) }] : []),
            {
              label: "Ver chat con el asesor",
              icon: MessagesSquare,
              onSelect: () => router.push(`/conversaciones/asesor/${advisor.id}?tab=asesores`),
            },
            advisor.activo
              ? {
                  label: isToggling ? "Desactivando…" : "Desactivar",
                  icon: Power,
                  danger: true,
                  disabled: isToggling,
                  onSelect: () => {
                    const confirmed = window.confirm(
                      `¿Desactivar a ${advisor.nombre}?\n\nDejará de recibir nuevos leads, pero se conservará su historial.`
                    );
                    if (confirmed) startToggle(() => toggleAdvisorAction(advisor.id, false));
                  },
                }
              : {
                  label: isToggling ? "Activando…" : "Activar",
                  icon: Power,
                  disabled: isToggling,
                  onSelect: () => startToggle(() => toggleAdvisorAction(advisor.id, true)),
                },
          ]}
        />
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title={`Editar a ${advisor.nombre}`} description="Cambia datos, prioridad, límite y rutas.">
        {editing && (
          <AdvisorForm
            advisor={advisor}
            action={boundUpdateAction}
            submitLabel="Guardar cambios"
            onSuccess={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        )}
      </Sheet>
    </Card>
  );
}
