"use client";

import { useActionState, useEffect } from "react";
import { UserPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADVISOR_PRIORITY_OPTIONS, LEAD_ROUTES } from "@/lib/advisors";
import type { AdvisorView } from "@/lib/types";
import type { AdvisorFormState } from "@/app/(protected)/asesores/actions";

const initialState: AdvisorFormState = {};

const inputClass =
  "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400";

export function AdvisorForm({
  advisor,
  action,
  submitLabel,
  onSuccess,
  onCancel,
}: {
  advisor?: AdvisorView;
  action: (prevState: AdvisorFormState, formData: FormData) => Promise<AdvisorFormState>;
  submitLabel?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  const priorityOptions = ADVISOR_PRIORITY_OPTIONS.some((option) => option.weight === advisor?.peso)
    ? ADVISOR_PRIORITY_OPTIONS
    : advisor
      ? [...ADVISOR_PRIORITY_OPTIONS, { label: `Personalizada (${advisor.peso})`, weight: advisor.peso }]
      : ADVISOR_PRIORITY_OPTIONS;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Nombre *
          <input name="nombre" required defaultValue={advisor?.nombre} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          WhatsApp *
          <input name="whatsapp" required defaultValue={advisor?.whatsapp} placeholder="5219981112233" className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Email EasyBroker
          <input
            name="emailEasyBroker"
            type="email"
            defaultValue={advisor?.emailEasyBroker}
            placeholder="correo@c21inova.com"
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          ManyChat ID
          <input name="manyChatId" defaultValue={advisor?.manyChatId} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Prioridad
          <select name="peso" defaultValue={advisor?.peso ?? 5} className={inputClass}>
            {priorityOptions.map((option) => (
              <option key={option.weight} value={option.weight}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Límite diario
          <input
            name="limiteDiario"
            type="number"
            min={1}
            step={1}
            defaultValue={advisor?.limiteDiario ?? ""}
            placeholder="Sin límite"
            className={inputClass}
          />
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-ink-600">
          Rutas permitidas (ninguna seleccionada = todas)
        </legend>
        <div className="flex flex-wrap gap-3">
          {LEAD_ROUTES.map((route) => (
            <label key={route} className="flex items-center gap-1.5 text-xs text-ink-700">
              <input
                type="checkbox"
                name="rutasPermitidas"
                value={route}
                defaultChecked={advisor?.rutasPermitidas.includes(route) ?? false}
                className="size-4 rounded border-ink-300"
              />
              {route === "Timeout" ? "Sin respuesta" : route}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1 text-xs font-medium text-ink-600">
        Observaciones
        <textarea
          name="observaciones"
          defaultValue={advisor?.observaciones}
          rows={2}
          className={inputClass}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-ink-600">
        <input
          type="checkbox"
          name="activo"
          defaultChecked={advisor?.activo ?? true}
          className="size-4 rounded border-ink-300"
        />
        Activo
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {advisor ? <Save className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
          {submitLabel ?? (advisor ? "Guardar cambios" : "Agregar asesor")}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        )}
      </div>

      {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}
