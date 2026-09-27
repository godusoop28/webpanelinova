"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  recordHumanReplyAction,
  resumeAiAction,
  saveAssistantSettingsAction,
  setControlAction,
  simulateMessageAction,
  syncCatalogAction,
  type ConversationActionState,
} from "@/app/(protected)/conversaciones/actions";

const initial: ConversationActionState = {};

function Feedback({ state }: { state: ConversationActionState }) {
  if (state.error) return <p className="text-xs text-rose-600">{state.error}</p>;
  if (state.success) return <p className="text-xs text-emerald-700">{state.success}</p>;
  return null;
}

const inputClass = "w-full rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-800";

export function ControlForms({ conversationId, control }: { conversationId: string; control: "AI" | "HUMAN" | "PAUSED" }) {
  const [pauseState, pauseAction, pausePending] = useActionState(setControlAction.bind(null, conversationId), initial);
  const [resumeState, resumeAction, resumePending] = useActionState(resumeAiAction.bind(null, conversationId), initial);

  if (control !== "AI") {
    return (
      <form action={resumeAction} className="space-y-2">
        <label className="flex items-start gap-2 text-xs text-ink-600">
          <input type="checkbox" name="answerPending" className="mt-0.5" />
          Responder ahora los mensajes que llegaron durante la pausa (si no, la IA contesta desde el próximo mensaje).
        </label>
        <Button type="submit" size="sm" loading={resumePending}>
          Reanudar IA
        </Button>
        <Feedback state={resumeState} />
      </form>
    );
  }

  return (
    <form action={pauseAction} className="space-y-2">
      <select name="control" defaultValue="HUMAN" className={inputClass}>
        <option value="HUMAN">Atención humana (alguien responde en este número)</option>
        <option value="PAUSED">Solo pausar la IA</option>
      </select>
      <input name="reason" required placeholder="Motivo (p. ej. lo atiende gerencia)" className={inputClass} />
      <Button type="submit" variant="secondary" size="sm" loading={pausePending}>
        Detener IA para este contacto
      </Button>
      <Feedback state={pauseState} />
    </form>
  );
}

export function HumanReplyForm({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(recordHumanReplyAction.bind(null, conversationId), initial);
  return (
    <form action={action} className="space-y-2">
      <textarea name="text" rows={2} placeholder="Lo que la persona del equipo respondió por la bandeja de ManyChat…" className={inputClass} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        Registrar respuesta humana
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function SettingsForm({
  settings,
}: {
  settings: {
    mode: string;
    debounceSeconds: number;
    maxWaitSeconds: number;
    maxClarifications: number;
    abandonHandoffMinutes: number;
    existingLeadWindowDays: number;
    handoffReopenMinutes: number;
    testSubscriberIds: string[];
    managementSubscriberIds: string[];
  };
}) {
  const [state, action, pending] = useActionState(saveAssistantSettingsAction, initial);
  const [syncState, syncAction, syncPending] = useActionState(syncCatalogAction, initial);
  return (
    <div className="space-y-4">
      <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-ink-600 sm:col-span-2">
          Modo del asistente
          <select name="mode" defaultValue={settings.mode} className={inputClass}>
            <option value="OFF">Apagado — ManyChat sigue con el flujo anterior</option>
            <option value="TEST_ONLY">Solo contactos de prueba</option>
            <option value="ON">Activo para todos</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Silencio para agrupar mensajes (s)
          <input name="debounceSeconds" type="number" min={2} max={20} defaultValue={settings.debounceSeconds} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Espera máxima de una ráfaga (s)
          <input name="maxWaitSeconds" type="number" min={5} max={60} defaultValue={settings.maxWaitSeconds} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Aclaraciones sin progreso antes de ofrecer persona
          <input name="maxClarifications" type="number" min={1} max={6} defaultValue={settings.maxClarifications} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Canalizar interés confirmado sin respuesta tras (min, 0 = nunca)
          <input name="abandonHandoffMinutes" type="number" min={0} max={1440} defaultValue={settings.abandonHandoffMinutes} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Reutilizar lead del mismo teléfono (días)
          <input name="existingLeadWindowDays" type="number" min={1} max={365} defaultValue={settings.existingLeadWindowDays} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600">
          Reabrir conversación con la IA tras canalizar (min)
          <input name="handoffReopenMinutes" type="number" min={0} max={1440} defaultValue={settings.handoffReopenMinutes} className={inputClass} />
          <span className="block font-normal text-ink-400">
            Se cuenta desde la canalización. Durante la espera el bot solo da un aviso; no quita pausas manuales. 0 = sin espera.
          </span>
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600 sm:col-span-2">
          Contactos de prueba (subscriber ID de ManyChat, separados por coma)
          <input name="testSubscriberIds" defaultValue={settings.testSubscriberIds.join(", ")} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-600 sm:col-span-2">
          Destinatarios de gerencia (subscriber ID de ManyChat; vacío = pendientes solo en el panel)
          <input name="managementSubscriberIds" defaultValue={settings.managementSubscriberIds.join(", ")} className={inputClass} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" loading={pending}>
            Guardar configuración
          </Button>
          <Feedback state={state} />
        </div>
      </form>
      <form action={syncAction} className="flex items-center gap-3 border-t border-ink-100 pt-3">
        <Button type="submit" variant="secondary" size="sm" loading={syncPending}>
          Sincronizar inventario de EasyBroker
        </Button>
        <Feedback state={syncState} />
      </form>
    </div>
  );
}

export function SimulatorForm({ subscriberId }: { subscriberId?: string }) {
  const [state, action, pending] = useActionState(simulateMessageAction, initial);
  return (
    <form action={action} className="space-y-2">
      {subscriberId && <input type="hidden" name="subscriberId" value={subscriberId} />}
      {!subscriberId && <input name="name" placeholder="Nombre del contacto simulado" className={inputClass} />}
      <textarea name="text" rows={2} required placeholder="Mensaje del cliente…" className={inputClass} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          Enviar como cliente
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
