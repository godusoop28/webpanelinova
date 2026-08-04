"use client";

import { useActionState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { runSyncAction, type SyncState } from "@/app/(protected)/integraciones/actions";
import { Button } from "@/components/ui/button";

const initialState: SyncState = { status: "idle" };

export function SyncButton({ lastRunLabel }: { lastRunLabel: string | null }) {
  const [state, action, pending] = useActionState(runSyncAction, initialState);

  return (
    <div className="space-y-3">
      <form action={action}>
        <Button type="submit" loading={pending}>
          <RefreshCw className="size-4" aria-hidden />
          Ejecutar sincronización
        </Button>
      </form>

      {state.status === "success" && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="size-3.5" aria-hidden />
          {state.message}
        </p>
      )}
      {state.status === "error" && (
        <p className="flex items-center gap-1.5 text-xs text-rose-600">
          <XCircle className="size-3.5" aria-hidden />
          {state.message}
        </p>
      )}

      <p className="text-xs text-ink-500">
        Última ejecución conocida: {lastRunLabel ?? "sin registro"}
      </p>
    </div>
  );
}
