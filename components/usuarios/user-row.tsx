"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, Pencil, Power, Trash2 } from "lucide-react";
import { toggleUserAction, resetPasswordAction, deleteUserAction, type UserFormState } from "@/app/(protected)/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ActionMenu } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/sheet";
import { Field, FormMessage } from "@/components/ui/field";
import { PasswordInput, ROLE_OPTIONS, UserForm } from "@/components/usuarios/new-user-form";

const initialState: UserFormState = {};

export interface PanelUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

function ResetPasswordForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(resetPasswordAction.bind(null, id), initialState);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nueva contraseña" required hint="Mínimo 8 caracteres. Comunícala al usuario por un medio seguro.">
        <PasswordInput />
      </Field>
      <FormMessage error={state.error} success={state.success ? "Contraseña actualizada." : null} />
      <div className="flex gap-2 border-t border-ink-100 pt-4">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          {state.success ? "Cerrar" : "Cancelar"}
        </Button>
        <Button type="submit" loading={pending}>
          Restablecer contraseña
        </Button>
      </div>
    </form>
  );
}

const ROLE_TONES: Record<string, "neutral" | "gold" | "info"> = { ADMIN: "neutral", DIRECCION: "gold", CONSULTA: "info" };

export function UserRow({ user, isSelf }: { user: PanelUser; isSelf: boolean }) {
  const [panel, setPanel] = useState<"edit" | "password" | null>(null);
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const roleLabel = ROLE_OPTIONS.find((r) => r.value === user.role)?.label ?? user.role;

  return (
    <tr className="transition-colors duration-150 hover:bg-surface-muted">
      <td data-label="Usuario" className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name || user.email} className="size-10 text-sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">
              {user.name}
              {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-500">(tú)</span>}
            </p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
        </div>
      </td>
      <td data-label="Rol" className="px-4 py-3">
        <Badge tone={ROLE_TONES[user.role] ?? "neutral"} className="rounded-md font-semibold tracking-wide">
          {roleLabel}
        </Badge>
      </td>
      <td data-label="Estado" className="px-4 py-3">
        <Badge tone={user.active ? "success" : "warning"} dot>
          {user.active ? "Activo" : "Inactivo"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button variant="secondary" size="sm" onClick={() => setPanel("password")}>
            <KeyRound className="size-3.5" aria-hidden />
            Contraseña
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPanel("edit")}>
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
          <ActionMenu
            label={`Más acciones para ${user.name}`}
            items={[
              {
                label: user.active ? "Desactivar" : "Activar",
                icon: Power,
                disabled: isSelf || isToggling,
                hint: isSelf ? "No puedes desactivar tu propia cuenta" : undefined,
                onSelect: () => startToggle(() => toggleUserAction(user.id, !user.active)),
              },
              {
                label: isDeleting ? "Eliminando…" : "Eliminar",
                icon: Trash2,
                danger: true,
                disabled: isSelf || isDeleting,
                hint: isSelf ? "No puedes eliminar tu propia cuenta" : undefined,
                onSelect: () => {
                  if (window.confirm(`¿Eliminar a ${user.name}? Esta acción no se puede deshacer.`)) startDelete(() => deleteUserAction(user.id));
                },
              },
            ]}
          />
        </div>
        <Sheet open={panel === "edit"} onClose={() => setPanel(null)} title="Editar usuario" description={user.email}>
          {panel === "edit" && <UserForm user={user} isSelf={isSelf} onDone={() => setPanel(null)} />}
        </Sheet>
        <Sheet open={panel === "password"} onClose={() => setPanel(null)} title="Restablecer contraseña" description={`${user.name} · ${user.email}`}>
          {panel === "password" && <ResetPasswordForm id={user.id} onDone={() => setPanel(null)} />}
        </Sheet>
      </td>
    </tr>
  );
}
