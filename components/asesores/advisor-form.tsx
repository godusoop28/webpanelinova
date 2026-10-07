"use client";

import { useActionState, useEffect } from "react";
import { UserPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, inputClass, selectClass } from "@/components/ui/field";
import { ADVISOR_PRIORITY_OPTIONS, LEAD_ROUTES } from "@/lib/advisors";
import type { AdvisorView } from "@/lib/types";
import type { AdvisorFormState } from "@/app/(protected)/asesores/actions";

const initialState: AdvisorFormState = {};

export function routeLabel(route: string): string {
  return route === "Timeout" ? "Sin respuesta" : route;
}

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">
          <input name="nombre" required defaultValue={advisor?.nombre} className={inputClass} />
        </Field>
        <Field label="WhatsApp" required hint="Con lada, p. ej. 5219981112233">
          <input name="whatsapp" required inputMode="tel" defaultValue={advisor?.whatsapp} placeholder="5219981112233" className={inputClass} />
        </Field>
        <Field label="ManyChat ID" hint="Necesario para recibir avisos por WhatsApp.">
          <input name="manyChatId" defaultValue={advisor?.manyChatId} className={inputClass} />
        </Field>
        <Field label="Email de EasyBroker" className="sm:col-span-2">
          <input name="emailEasyBroker" type="email" defaultValue={advisor?.emailEasyBroker} placeholder="correo@c21inova.com" className={inputClass} />
        </Field>
        <Field label="Prioridad" hint="Peso en la ruleta ponderada.">
          <select name="peso" defaultValue={advisor?.peso ?? 5} className={selectClass}>
            {priorityOptions.map((option) => (
              <option key={option.weight} value={option.weight}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Límite diario" hint="Vacío = sin límite.">
          <input name="limiteDiario" type="number" min={1} step={1} defaultValue={advisor?.limiteDiario ?? ""} placeholder="Sin límite" className={inputClass} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-ink-700">Rutas permitidas</legend>
        <p className="text-[11px] text-ink-500">Si no marcas ninguna, el asesor participa en todas las rutas.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LEAD_ROUTES.map((route) => (
            <label key={route} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50">
              <input
                type="checkbox"
                name="rutasPermitidas"
                value={route}
                defaultChecked={advisor?.rutasPermitidas.includes(route) ?? false}
                className="size-4 rounded border-ink-300 accent-[var(--color-accent-600)]"
              />
              {routeLabel(route)}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Observaciones">
        <textarea name="observaciones" defaultValue={advisor?.observaciones} rows={3} className={inputClass} />
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-ink-700">
        <input type="checkbox" name="activo" defaultChecked={advisor?.activo ?? true} className="size-4 rounded border-ink-300 accent-[var(--color-accent-600)]" />
        Activo (participa en la distribución)
      </label>

      <FormMessage error={state.error} />

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
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
    </form>
  );
}
