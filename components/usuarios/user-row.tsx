"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import {
  updateUserAction,
  toggleUserAction,
  resetPasswordAction,
  deleteUserAction,
  type UserFormState,
} from "@/app/(protected)/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { User } from "@prisma/client";

const initialState: UserFormState = {};

function ResetPasswordForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(resetPasswordAction.bind(null, id), initialState);
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 bg-surface-muted p-2">
      <input
        name="password"
        type="password"
        placeholder="Nueva contraseña"
        required
        minLength={8}
        className="rounded-md border border-ink-200 px-2 py-1.5 text-xs"
      />
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Restablecer
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancelar
      </Button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
      {state.success && <span className="text-xs text-emerald-600">Contraseña actualizada.</span>}
    </form>
  );
}

export function UserRow({ user, isSelf }: { user: User; isSelf: boolean }) {
  const boundAction = updateUserAction.bind(null, user.id);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [resetting, setResetting] = useState(false);

  return (
    <tr className="border-b border-ink-50 last:border-0">
      <td data-label="Usuario" className="px-5 py-3">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input
            name="nombre"
            defaultValue={user.name}
            className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm sm:w-36"
          />
          <input
            name="correo"
            type="email"
            defaultValue={user.email}
            className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm sm:w-52"
          />
          <select
            name="rol"
            defaultValue={user.role}
            className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm sm:w-auto"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="DIRECCION">DIRECCION</option>
            <option value="CONSULTA">CONSULTA</option>
          </select>
          <input type="hidden" name="activo" value={user.active ? "on" : "off"} />
          <Button type="submit" variant="secondary" size="sm" loading={pending}>
            Guardar
          </Button>
          {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
        </form>
        {resetting && <ResetPasswordForm id={user.id} onDone={() => setResetting(false)} />}
      </td>
      <td data-label="Estado" className="px-5 py-3">
        <Badge tone={user.active ? "success" : "neutral"}>{user.active ? "Activo" : "Inactivo"}</Badge>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setResetting((v) => !v)}>
            <KeyRound className="size-3.5" aria-hidden />
            Contraseña
          </Button>
          <Button
            variant={user.active ? "danger" : "primary"}
            size="sm"
            loading={isToggling}
            disabled={isSelf}
            onClick={() => startToggle(() => toggleUserAction(user.id, !user.active))}
          >
            {user.active ? "Desactivar" : "Activar"}
          </Button>
          {!isSelf && (
            <Button
              variant="ghost"
              size="sm"
              loading={isDeleting}
              onClick={() => {
                if (window.confirm(`¿Eliminar a ${user.name}? Esta acción no se puede deshacer.`)) {
                  startDelete(() => deleteUserAction(user.id));
                }
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
