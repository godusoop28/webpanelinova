"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  createRecipientAction,
  recordConsentAction,
  saveEventAction,
  saveReportSettingsAction,
  sendTestReportAction,
  updateRecipientFlagsAction,
  verifyRecipientAction,
  type PropertyActionState,
} from "@/app/(protected)/propiedades/actions";

const initial: PropertyActionState = {};
const inputClass = "w-full rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-800";
const labelClass = "space-y-1 text-xs font-medium text-ink-600";

function Feedback({ state }: { state: PropertyActionState }) {
  if (state.error) return <p className="text-xs text-rose-600">{state.error}</p>;
  if (state.success) return <p className="text-xs text-emerald-700">{state.success}</p>;
  return null;
}

export function NewRecipientForm({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState(createRecipientAction, initial);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="publicId" value={publicId} />
      <label className={labelClass}>
        Nombre del destinatario
        <input name="name" required className={inputClass} />
      </label>
      <label className={labelClass}>
        WhatsApp
        <input name="phone" required placeholder="33 1234 5678" className={inputClass} />
      </label>
      <label className={labelClass}>
        Relación con el inmueble
        <select name="relation" defaultValue="propietario" className={inputClass}>
          <option value="propietario">Propietario</option>
          <option value="copropietario">Copropietario</option>
          <option value="representante">Representante</option>
          <option value="administrador">Administrador</option>
          <option value="otro">Otro</option>
        </select>
      </label>
      <label className={labelClass}>
        ID de contacto en ManyChat (opcional)
        <input name="manyChatSubscriberId" inputMode="numeric" className={inputClass} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Notas
        <input name="notes" className={inputClass} />
      </label>
      <label className="flex items-start gap-2 text-xs text-ink-600 sm:col-span-2">
        <input type="checkbox" name="confirmNotProspect" className="mt-0.5" />
        Confirmo que es el propietario o la persona que él designó (no un prospecto que preguntó por la propiedad).
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" loading={pending}>
          Agregar destinatario
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function RecipientControls({
  recipient,
  publicId,
  canSendTest,
}: {
  recipient: { id: string; consentStatus: string; verifiedAt: Date | null; weeklyReport: boolean; eventNotifications: boolean; active: boolean };
  publicId: string;
  canSendTest: boolean;
}) {
  const [consentState, consentAction, consentPending] = useActionState(recordConsentAction.bind(null, recipient.id, publicId), initial);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyRecipientAction.bind(null, recipient.id, publicId), initial);
  const [flagsState, flagsAction, flagsPending] = useActionState(updateRecipientFlagsAction.bind(null, recipient.id, publicId), initial);
  const [testState, testAction, testPending] = useActionState(sendTestReportAction.bind(null, recipient.id, publicId), initial);
  const ready = recipient.consentStatus === "GRANTED" && Boolean(recipient.verifiedAt);

  return (
    <div className="space-y-3 border-t border-ink-100 pt-3">
      <form action={consentAction} className="space-y-2">
        <input name="evidence" placeholder="Cómo y cuándo autorizó (p. ej. firmó el contrato de exclusiva con aviso por WhatsApp el 20/09)" className={inputClass} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="decision" value="grant" size="sm" variant="secondary" loading={consentPending}>
            Registrar autorización
          </Button>
          {recipient.consentStatus === "GRANTED" && (
            <Button type="submit" name="decision" value="revoke" size="sm" variant="ghost">
              Revocar
            </Button>
          )}
          <Feedback state={consentState} />
        </div>
      </form>
      <form action={verifyAction} className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="secondary" loading={verifyPending}>
          Verificar en ManyChat
        </Button>
        <Feedback state={verifyState} />
      </form>
      <form action={flagsAction} className="flex flex-wrap items-center gap-3 text-xs text-ink-700">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="weeklyReport" defaultChecked={recipient.weeklyReport} disabled={!ready && !recipient.weeklyReport} /> Reporte semanal
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="eventNotifications" defaultChecked={recipient.eventNotifications} disabled={!ready && !recipient.eventNotifications} /> Avisos de actividad
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="active" defaultChecked={recipient.active} /> Activo
        </label>
        <Button type="submit" size="sm" variant="ghost" loading={flagsPending}>
          Guardar
        </Button>
        <Feedback state={flagsState} />
      </form>
      {canSendTest && (
        <form action={testAction} className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="ghost" loading={testPending} disabled={!ready}>
            Enviar prueba del reporte a este destinatario
          </Button>
          <Feedback state={testState} />
        </form>
      )}
    </div>
  );
}

const TYPES = [
  ["SHOWING", "Visita"],
  ["OPEN_HOUSE", "Open House"],
  ["APPOINTMENT", "Cita"],
  ["OFFER", "Oferta recibida"],
  ["PRICE_UPDATE", "Actualización de precio"],
  ["MARKETING", "Acción de promoción"],
  ["OTHER", "Otra"],
] as const;

function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function EventForm({
  publicId,
  event,
}: {
  publicId: string;
  event?: {
    id: string;
    type: string;
    status: string;
    title: string;
    description: string | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
    outcome: string | null;
    notifyRecipients: boolean;
  };
}) {
  const [state, action, pending] = useActionState(saveEventAction.bind(null, event?.id ?? null), initial);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="publicId" value={publicId} />
      <label className={labelClass}>
        Tipo
        <select name="type" defaultValue={event?.type ?? "SHOWING"} className={inputClass}>
          {TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Estado
        <select name="status" defaultValue={event?.status ?? "SCHEDULED"} className={inputClass}>
          <option value="SCHEDULED">Programada</option>
          <option value="DONE">Realizada</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Título
        <input name="title" required defaultValue={event?.title ?? ""} className={inputClass} />
      </label>
      <label className={labelClass}>
        Fecha y hora programada (CDMX)
        <input name="scheduledAt" type="datetime-local" defaultValue={toLocalInput(event?.scheduledAt ?? null)} className={inputClass} />
      </label>
      <label className={labelClass}>
        Fecha y hora en que se realizó (CDMX)
        <input name="completedAt" type="datetime-local" defaultValue={toLocalInput(event?.completedAt ?? null)} className={inputClass} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Descripción
        <textarea name="description" rows={2} defaultValue={event?.description ?? ""} className={inputClass} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Resumen de lo realizado (solo si está realizada; exactamente lo que se registró, sin suponer asistentes ni acuerdos)
        <textarea name="outcome" rows={2} defaultValue={event?.outcome ?? ""} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-600 sm:col-span-2">
        <input type="checkbox" name="notifyRecipients" defaultChecked={event?.notifyRecipients ?? true} /> Avisar a los destinatarios habilitados de esta propiedad
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" loading={pending}>
          {event ? "Guardar cambios" : "Registrar actividad"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

type FieldIds = { weekly: Record<string, number> | null; event: Record<string, number> | null };

export function ReportSettingsForm({
  settings,
  fieldIds,
}: {
  settings: {
    weeklyEnabled: boolean;
    weeklyHour: number | null;
    weeklyMinute: number;
    eventNotificationsEnabled: boolean;
    manyChatWeeklyFlowNs: string | null;
    manyChatEventFlowNs: string | null;
    templateNote: string | null;
  };
  fieldIds: FieldIds;
}) {
  const [state, action, pending] = useActionState(saveReportSettingsAction, initial);
  const weeklyKeys: [string, string][] = [
    ["property", "Propiedad ({{1}})"],
    ["period", "Periodo ({{2}})"],
    ["weekLeads", "Interesados en la semana ({{3}})"],
    ["cumulative", "Acumulado ({{4}})"],
    ["sources", "Procedencia ({{5}})"],
    ["activity", "Actividad ({{6}})"],
  ];
  const eventKeys: [string, string][] = [
    ["property", "Propiedad ({{1}})"],
    ["headline", "Encabezado ({{2}})"],
    ["detail", "Detalle ({{3}})"],
  ];
  return (
    <form action={action} className="space-y-5">
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-ink-900">Reporte semanal (viernes, hora de Ciudad de México)</legend>
        <label className="flex items-center gap-2 text-xs text-ink-700 sm:col-span-3">
          <input type="checkbox" name="weeklyEnabled" defaultChecked={settings.weeklyEnabled} /> Habilitar envío programado
        </label>
        <label className={labelClass}>
          Hora (0–23, vacío = sin confirmar)
          <input name="weeklyHour" type="number" min={0} max={23} defaultValue={settings.weeklyHour ?? ""} className={inputClass} />
        </label>
        <label className={labelClass}>
          Minuto
          <input name="weeklyMinute" type="number" min={0} max={59} defaultValue={settings.weeklyMinute} className={inputClass} />
        </label>
        <label className={labelClass}>
          Flujo de ManyChat con la plantilla (flow ns)
          <input name="manyChatWeeklyFlowNs" defaultValue={settings.manyChatWeeklyFlowNs ?? ""} placeholder="content2026…" className={inputClass} />
        </label>
        {weeklyKeys.map(([key, label]) => (
          <label key={key} className={labelClass}>
            Campo ManyChat: {label}
            <input name={`weekly.${key}`} inputMode="numeric" defaultValue={fieldIds.weekly?.[key] ?? ""} className={inputClass} />
          </label>
        ))}
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-ink-900">Avisos de actividad</legend>
        <label className="flex items-center gap-2 text-xs text-ink-700 sm:col-span-3">
          <input type="checkbox" name="eventNotificationsEnabled" defaultChecked={settings.eventNotificationsEnabled} /> Habilitar avisos
        </label>
        <label className={labelClass}>
          Flujo de ManyChat con la plantilla (flow ns)
          <input name="manyChatEventFlowNs" defaultValue={settings.manyChatEventFlowNs ?? ""} className={inputClass} />
        </label>
        {eventKeys.map(([key, label]) => (
          <label key={key} className={labelClass}>
            Campo ManyChat: {label}
            <input name={`event.${key}`} inputMode="numeric" defaultValue={fieldIds.event?.[key] ?? ""} className={inputClass} />
          </label>
        ))}
      </fieldset>
      <label className={labelClass}>
        Nota sobre las plantillas (estado de aprobación en Meta)
        <input name="templateNote" defaultValue={settings.templateNote ?? ""} className={inputClass} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          Guardar configuración
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
