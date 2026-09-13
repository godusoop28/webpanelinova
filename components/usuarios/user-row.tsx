"use client";

import { useActionState, useTransition } from "react";
import { updateUserAction, toggleUserAction, type UserFormState } from "@/app/(protected)/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AuthorizedUser } from "@/lib/google-sheets";

const initialState: UserFormState = {};

export function UserRow({ user }: { user: AuthorizedUser }) {
  const boundAction = updateUserAction.bind(null, user.rowNumber);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const [isToggling, startToggle] = useTransition();

  return (
    <tr className="border-b border-ink-50 last:border-0">
      <td data-label="Usuario" className="px-5 py-3">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input
            name="nombre"
            defaultValue={user.nombre}
            className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm sm:w-36"
          />
          <input
            name="correo"
            type="email"
            defaultValue={user.correo}
            className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm sm:w-52"
          />
          <select
            name="rol"
            defaultValue={user.rol}
            className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm sm:w-auto"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="DIRECCION">DIRECCION</option>
            <option value="CONSULTA">CONSULTA</option>
          </select>
          <input type="hidden" name="activo" value={user.activo ? "on" : "off"} />
          <Button type="submit" variant="secondary" size="sm" loading={pending}>
            Guardar
          </Button>
          {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
        </form>
      </td>
      <td data-label="Estado" className="px-5 py-3">
        <Badge tone={user.activo ? "success" : "neutral"}>
          {user.activo ? "Activo" : "Inactivo"}
        </Badge>
      </td>
      <td className="px-5 py-3 text-left md:text-right">
        <Button
          variant={user.activo ? "danger" : "primary"}
          size="sm"
          loading={isToggling}
          onClick={() => startToggle(() => toggleUserAction(user.rowNumber, !user.activo))}
        >
          {user.activo ? "Desactivar" : "Activar"}
        </Button>
      </td>
    </tr>
  );
}
