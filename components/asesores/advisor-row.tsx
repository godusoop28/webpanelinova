"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pause, Play, Pencil, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdvisorForm } from "@/components/asesores/advisor-form";
import {
  isPaused as computeIsPaused,
  PAUSE_INDEFINITE,
  priorityLabelForWeight,
} from "@/lib/advisors";
import { formatMexicoCityDateTime } from "@/lib/timezone";
import type { AdvisorRow as AdvisorRowType } from "@/lib/google-sheets";
import {
  pauseAdvisorAction,
  resumeAdvisorAction,
  toggleAdvisorAction,
  updateAdvisorAction,
  type AdvisorFormState,
} from "@/app/(protected)/asesores/actions";

const pauseInitialState: AdvisorFormState = {};

function PausePanel({ rowNumber, onDone }: { rowNumber: number; onDone: () => void }) {
  const boundAction = pauseAdvisorAction.bind(null, rowNumber);
  const [state, formAction, pending] = useActionState(boundAction, pauseInitialState);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-ink-100 bg-surface-muted p-3">
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
        <input
          type="datetime-local"
          name="customDateTime"
          className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs"
        />
        <Button type="submit" name="mode" value="custom" variant="secondary" size="sm" loading={pending}>
          Pausar hasta esa fecha
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
      {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

export function AdvisorRow({ advisor, leadsHoy }: { advisor: AdvisorRowType; leadsHoy: number }) {
  const [editing, setEditing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [isToggling, startToggle] = useTransition();
  const [isResuming, startResume] = useTransition();

  const now = new Date();
  const paused = advisor.activo && computeIsPaused(advisor, now);

  const boundUpdateAction = updateAdvisorAction.bind(null, advisor.rowNumber, advisor.id, advisor.pausadoHasta);

  if (editing) {
    return (
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-900">Editar a {advisor.nombre}</h3>
        <AdvisorForm
          advisor={advisor}
          action={boundUpdateAction}
          submitLabel="Guardar cambios"
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink-900">{advisor.nombre || "—"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!advisor.activo ? (
              <Badge tone="neutral">Inactivo</Badge>
            ) : paused ? (
              <Badge tone="warning">
                {advisor.pausadoHasta === PAUSE_INDEFINITE
                  ? "Pausado indefinidamente"
                  : `Pausado hasta ${formatMexicoCityDateTime(new Date(advisor.pausadoHasta ?? ""))}`}
              </Badge>
            ) : (
              <Badge tone="success">Disponible</Badge>
            )}
            <Badge tone="gold">Prioridad: {priorityLabelForWeight(advisor.peso)}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
          {advisor.activo &&
            (paused ? (
              <Button
                variant="secondary"
                size="sm"
                loading={isResuming}
                onClick={() => startResume(() => resumeAdvisorAction(advisor.rowNumber))}
              >
                <Play className="size-3.5" aria-hidden />
                Reanudar
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setPausing((v) => !v)}>
                <Pause className="size-3.5" aria-hidden />
                Pausar
              </Button>
            ))}
          <Button
            variant={advisor.activo ? "danger" : "primary"}
            size="sm"
            loading={isToggling}
            onClick={() => {
              if (advisor.activo) {
                const confirmed = window.confirm(
                  `¿Desactivar a ${advisor.nombre}?\n\nDejará de recibir nuevos leads, pero se conservará su historial.`
                );
                if (!confirmed) return;
              }
              startToggle(() => toggleAdvisorAction(advisor.rowNumber, !advisor.activo));
            }}
          >
            <Power className="size-3.5" aria-hidden />
            {advisor.activo ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </div>

      {pausing && (
        <div className="mt-3">
          <PausePanel rowNumber={advisor.rowNumber} onDone={() => setPausing(false)} />
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 md:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-500">WhatsApp</dt>
          <dd className="text-ink-700">{advisor.whatsapp || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Email EasyBroker</dt>
          <dd className="truncate text-ink-700">{advisor.emailEasyBroker || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Tipo de asignación</dt>
          <dd className="text-ink-700">{advisor.tipoAsignacion || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Leads hoy</dt>
          <dd className="text-ink-700">
            {leadsHoy}
            {advisor.limiteDiario !== null ? ` / ${advisor.limiteDiario}` : " · Sin límite"}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-3 md:col-span-4">
          <dt className="text-xs text-ink-500">Rutas</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {advisor.rutasPermitidas.length === 0 ? (
              <Badge tone="neutral">Todas las rutas</Badge>
            ) : (
              advisor.rutasPermitidas.map((route) => (
                <Badge key={route} tone="neutral">
                  {route}
                </Badge>
              ))
            )}
          </dd>
        </div>
        {advisor.observaciones && (
          <div className="col-span-2 sm:col-span-3 md:col-span-4">
            <dt className="text-xs text-ink-500">Observaciones</dt>
            <dd className="text-ink-600">{advisor.observaciones}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
