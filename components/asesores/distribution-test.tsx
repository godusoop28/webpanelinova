"use client";

import { useActionState } from "react";
import { FlaskConical, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, inputClass, selectClass } from "@/components/ui/field";
import { LEAD_ROUTES } from "@/lib/advisors";
import { routeLabel } from "@/components/asesores/advisor-form";
import { simulateDistributionAction, type DistributionTestState } from "@/app/(protected)/asesores/actions";

const initialState: DistributionTestState = {};

/** Ruleta ponderada en memoria: no crea leads, no mueve la ruleta real ni llama a EasyBroker o ManyChat. */
export function DistributionTest() {
  const [state, action, pending] = useActionState(simulateDistributionAction, initialState);
  const total = state.results?.reduce((sum, r) => sum + r.count, 0) ?? 0;
  const maxCount = state.results?.reduce((max, r) => Math.max(max, r.count), 0) ?? 0;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <form action={action} className="flex flex-wrap items-end gap-3">
          <Field label="Ruta" className="w-full sm:w-56">
            <select name="route" defaultValue={LEAD_ROUTES[0]} className={selectClass}>
              {LEAD_ROUTES.map((route) => (
                <option key={route} value={route}>
                  {routeLabel(route)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Simulaciones" className="w-32">
            <input name="iterations" type="number" min={1} max={1000} defaultValue={100} className={inputClass} />
          </Field>
          <Button type="submit" variant="dark" loading={pending}>
            {!pending && <FlaskConical className="size-4" aria-hidden />}
            Probar distribución
          </Button>
        </form>

        <FormMessage error={state.error} />

        {state.results && state.results.length > 0 && (
          <ul className="space-y-2" aria-label="Resultado de la simulación">
            {state.results.map((result) => (
              <li key={result.id} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 truncate text-ink-800" title={result.nombre}>
                  {result.nombre}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                  <div className="h-full rounded-full bg-accent-500" style={{ width: maxCount > 0 ? `${(result.count / maxCount) * 100}%` : "0%" }} />
                </div>
                <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-ink-900">{result.count}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-500">{total > 0 ? Math.round((result.count / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        )}
        {state.results && state.results.length === 0 && <p className="text-sm text-ink-500">Ningún asesor elegible para esa ruta en este momento.</p>}
      </div>

      <div className="space-y-3 rounded-xl bg-ink-50 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-ink-900">
          <Info className="size-4 text-accent-700" aria-hidden />
          Distribución ponderada
        </p>
        <p className="text-xs leading-relaxed text-ink-600">
          Usa la disponibilidad, las rutas, los límites y la prioridad actuales de cada asesor para simular cómo se repartirían los nuevos leads.
        </p>
        <p className="rounded-lg bg-accent-100 px-3 py-2 text-xs font-medium text-accent-800">
          No crea leads, no modifica asignaciones reales ni envía mensajes.
        </p>
      </div>
    </div>
  );
}
