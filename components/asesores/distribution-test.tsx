"use client";

import { useActionState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAD_ROUTES } from "@/lib/advisors";
import { simulateDistributionAction, type DistributionTestState } from "@/app/(protected)/asesores/actions";

const initialState: DistributionTestState = {};

export function DistributionTest() {
  const [state, action, pending] = useActionState(simulateDistributionAction, initialState);

  const maxCount = state.results?.reduce((max, r) => Math.max(max, r.count), 0) ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">
        Ejecuta la ruleta ponderada en memoria, sin crear leads ni llamar a EasyBroker o ManyChat.
        Útil para validar visualmente los pesos configurados.
      </p>

      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Ruta
          <select
            name="route"
            defaultValue={LEAD_ROUTES[0]}
            className="block rounded-lg border border-ink-200 px-3 py-2 text-sm"
          >
            {LEAD_ROUTES.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Simulaciones
          <input
            name="iterations"
            type="number"
            min={1}
            max={1000}
            defaultValue={100}
            className="block w-28 rounded-lg border border-ink-200 px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" loading={pending}>
          <FlaskConical className="size-4" aria-hidden />
          Probar distribución
        </Button>
      </form>

      {state.error && <p className="text-xs text-rose-600">{state.error}</p>}

      {state.results && state.results.length > 0 && (
        <div className="space-y-1.5">
          {state.results.map((result) => (
            <div key={result.id} className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 truncate text-ink-700">{result.nombre}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-ink-100">
                <div
                  className="h-full rounded bg-gold-500"
                  style={{ width: maxCount > 0 ? `${(result.count / maxCount) * 100}%` : "0%" }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-ink-500">{result.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
