"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, Save, UserPlus } from "lucide-react";
import { createUserAction, updateUserAction, type UserFormState } from "@/app/(protected)/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, inputClass, selectClass } from "@/components/ui/field";

const initialState: UserFormState = {};

export const ROLE_OPTIONS = [
  { value: "ADMIN", label: "ADMIN" },
  { value: "DIRECCION", label: "DIRECCIÓN" },
  { value: "CONSULTA", label: "CONSULTA" },
] as const;

export function PasswordInput({ name = "password", placeholder }: { name?: string; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder={placeholder}
        className={`${inputClass} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

function ActiveToggle({ defaultChecked, locked }: { defaultChecked: boolean; locked?: boolean }) {
  if (locked) {
    return (
      <div className="rounded-lg bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
        <input type="hidden" name="activo" value="on" />
        Tu propia cuenta permanece activa.
      </div>
    );
  }
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input type="checkbox" name="activo" defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-ink-300 transition-colors duration-150 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-150 peer-checked:bg-accent-500 peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500" />
      <span className="text-sm text-ink-700">Activo: puede iniciar sesión en el panel.</span>
    </label>
  );
}

/** Alta (sin `user`) o edición de un usuario del panel. */
export function UserForm({
  user,
  isSelf = false,
  onDone,
}: {
  user?: { id: string; name: string; email: string; role: string; active: boolean };
  isSelf?: boolean;
  onDone: () => void;
}) {
  const action = user ? updateUserAction.bind(null, user.id) : createUserAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nombre completo" required>
        <input name="nombre" required defaultValue={user?.name} placeholder="Nombre y apellido" autoComplete="name" className={inputClass} />
      </Field>
      <Field label="Correo electrónico" required>
        <input name="correo" type="email" required defaultValue={user?.email} placeholder="correo@century21inova.com" autoComplete="email" className={inputClass} />
      </Field>
      {!user && (
        <Field label="Contraseña" required hint="Mínimo 8 caracteres.">
          <PasswordInput />
        </Field>
      )}
      <Field label="Rol" required hint={isSelf ? "Si eres el último ADMIN activo, el sistema no permitirá quitarte el rol." : undefined}>
        <select name="rol" defaultValue={user?.role ?? "CONSULTA"} className={selectClass}>
          {ROLE_OPTIONS.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-ink-700">Estado</span>
        <ActiveToggle defaultChecked={user?.active ?? true} locked={isSelf} />
      </div>
      <FormMessage error={state.error} />
      <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {!pending && (user ? <Save className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />)}
          {user ? "Guardar cambios" : "Crear usuario"}
        </Button>
      </div>
    </form>
  );
}
