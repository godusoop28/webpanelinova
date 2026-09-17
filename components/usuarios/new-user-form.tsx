"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { createUserAction, type UserFormState } from "@/app/(protected)/usuarios/actions";
import { Button } from "@/components/ui/button";

const initialState: UserFormState = {};

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUserAction, initialState);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.3fr_1fr_1fr_auto_auto]">
      <input
        name="nombre"
        placeholder="Nombre completo"
        required
        className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      />
      <input
        name="correo"
        type="email"
        placeholder="correo@century21inova.com"
        required
        className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      />
      <input
        name="password"
        type="password"
        placeholder="Contraseña (mín. 8 caracteres)"
        required
        minLength={8}
        className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      />
      <select
        name="rol"
        defaultValue="CONSULTA"
        className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        <option value="ADMIN">ADMIN</option>
        <option value="DIRECCION">DIRECCION</option>
        <option value="CONSULTA">CONSULTA</option>
      </select>
      <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm text-ink-600">
        <input type="checkbox" name="activo" defaultChecked className="size-4 rounded border-ink-300" />
        Activo
      </label>
      <Button type="submit" loading={pending} className="whitespace-nowrap">
        <UserPlus className="size-4" aria-hidden />
        Agregar
      </Button>
      {state.error && <p className="sm:col-span-2 lg:col-span-6 text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}
