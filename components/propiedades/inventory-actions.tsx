"use client";

import { useActionState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  restorePropertyAction,
  syncInventoryAction,
  type InventoryActionState,
} from "@/app/(protected)/propiedades/inventario/actions";

const initial: InventoryActionState = {};

function Feedback({ state }: { state: InventoryActionState }) {
  if (state.error) return <p className="text-xs text-rose-600">{state.error}</p>;
  if (state.success) return <p className="text-xs text-emerald-700">{state.success}</p>;
  return null;
}

export function SyncNowButton() {
  const [state, action, pending] = useActionState(syncInventoryAction, initial);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="secondary" loading={pending}>
        <RefreshCw className="size-4" aria-hidden />
        Sincronizar ahora
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function RestoreButton({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState(restorePropertyAction, initial);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`¿Volver a crear ${publicId} en EasyBroker con la copia guardada? Después se publica igual que antes en 21Online.`)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="publicId" value={publicId} />
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        <RotateCcw className="size-4" aria-hidden />
        Restaurar
      </Button>
      <Feedback state={state} />
    </form>
  );
}
