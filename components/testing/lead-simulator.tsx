"use client";

import { useActionState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { simulateLeadAction, type SimulateLeadState } from "@/app/(protected)/testing/actions";

const initialState: SimulateLeadState = {};

const INTERES_OPTIONS = ["Propiedad", "Explorar", "Campaña", "Timeout", "Sin respuesta"];

const inputClass =
  "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400";

export function LeadSimulator() {
  const [state, action, pending] = useActionState(simulateLeadAction, initialState);
  const result = state.result;

  return (
    <div className="space-y-5">
      <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Nombre *
          <input name="nombre" required defaultValue="Prueba Innova" className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Teléfono *
          <input name="telefono" required defaultValue="5555555555" className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Interés *
          <select name="interes" defaultValue="Explorar" className={inputClass}>
            {INTERES_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Origen
          <input name="origen" defaultValue="Prueba manual" className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600 sm:col-span-2">
          Datos de propiedad (public_id de EasyBroker para &quot;Propiedad&quot;, o texto con código EB-... para &quot;Campaña&quot;)
          <input name="datosPropiedad" placeholder="EB-C1234" className={inputClass} />
        </label>

        <div className="sm:col-span-2">
          <Button type="submit" loading={pending}>
            <FlaskConical className="size-4" aria-hidden />
            Simular lead (shadow)
          </Button>
        </div>
      </form>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      {result && (
        <div className="space-y-4 rounded-xl border border-ink-100 bg-surface-muted p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">Modo: {result.mode}</Badge>
            <Badge tone="neutral">Ruta: {result.routeLabel}</Badge>
            <Badge tone="neutral">Interés: {result.interestType}</Badge>
            {result.duplicate && <Badge tone="warning">Duplicado</Badge>}
          </div>

          <div>
            <p className="text-xs font-medium text-ink-500">Lead creado</p>
            <p className="font-mono text-sm text-ink-800">{result.leadId}</p>
          </div>

          {result.property && (
            <div>
              <p className="text-xs font-medium text-ink-500">Propiedad consultada</p>
              <p className="text-sm text-ink-800">
                {result.property.title} ({result.property.publicId})
                {result.property.agentEmail ? ` — agente: ${result.property.agentEmail}` : ""}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-ink-500">Selección de asesor</p>
            {result.selection.ok ? (
              <div className="mt-1 space-y-1 text-sm text-ink-800">
                <p>
                  <span className="font-medium">{result.selection.advisorName}</span> — método{" "}
                  {result.selection.method}, peso {result.selection.weight}
                </p>
                <p className="text-xs text-ink-500">{result.selection.reason}</p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-rose-600">Sin asesores disponibles para esta ruta.</p>
            )}
            {result.selection.candidatesConsidered.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-ink-500">Candidatos evaluados</p>
                {result.selection.candidatesConsidered.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs text-ink-600">
                    <span className="w-32 truncate">{c.name}</span>
                    <span>peso {c.weight}</span>
                    <span>· hoy {c.todayCount}</span>
                    {c.dailyLimit !== null && <span>· límite {c.dailyLimit}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-ink-500">Acciones {result.mode === "shadow" ? "que se habrían ejecutado" : "ejecutadas"}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {result.actions.map((a) => (
                <li key={a}>
                  <Badge tone={a.includes("failed") || a.includes("not_found") ? "danger" : "success"}>{a}</Badge>
                </li>
              ))}
            </ul>
          </div>

          {result.mode === "live" && (
            <div>
              <p className="text-xs font-medium text-ink-500">EasyBroker / ManyChat</p>
              <p className="text-sm text-ink-800">
                contact_request: {result.easyBroker.contactRequestId ?? "—"} · contacto:{" "}
                {result.easyBroker.contactId ?? "—"} · confirmado: {String(result.easyBroker.confirmed)} · notificado:{" "}
                {String(result.manyChat.notified)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
