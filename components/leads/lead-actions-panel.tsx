"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { LEAD_STATUS_LABELS } from "@/lib/lead-status";
import {
  changeLeadStatusAction,
  reassignLeadAction,
  type LeadActionState,
} from "@/app/(protected)/leads/[id]/actions";

const initialState: LeadActionState = {};

export function LeadActionsPanel({
  leadId,
  currentStatus,
  advisors,
}: {
  leadId: string;
  currentStatus: string;
  advisors: { id: string; nombre: string }[];
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    changeLeadStatusAction.bind(null, leadId),
    initialState
  );
  const [reassignState, reassignAction, reassignPending] = useActionState(
    reassignLeadAction.bind(null, leadId),
    initialState
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <form action={statusAction} className="space-y-2">
        <label className="block space-y-1 text-xs font-medium text-ink-600">
          Cambiar estado
          <div className="flex gap-2">
            <select name="status" defaultValue={currentStatus} className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm">
              {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm" loading={statusPending}>
              Guardar
            </Button>
          </div>
        </label>
        {statusState.error && <p className="text-xs text-rose-600">{statusState.error}</p>}
      </form>

      <form action={reassignAction} className="space-y-2">
        <label className="block space-y-1 text-xs font-medium text-ink-600">
          Reasignar a otro asesor
          <div className="flex gap-2">
            <select name="advisorId" required className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm">
              <option value="">Selecciona un asesor</option>
              {advisors.map((advisor) => (
                <option key={advisor.id} value={advisor.id}>
                  {advisor.nombre}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm" loading={reassignPending}>
              Reasignar
            </Button>
          </div>
        </label>
        {reassignState.error && <p className="text-xs text-rose-600">{reassignState.error}</p>}
        {reassignState.success && <p className="text-xs text-emerald-600">Lead reasignado.</p>}
      </form>
    </div>
  );
}
