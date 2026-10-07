"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/state";
import { selectClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { ROLE_OPTIONS, UserForm } from "@/components/usuarios/new-user-form";
import { UserRow, type PanelUser } from "@/components/usuarios/user-row";

export function UsersBoard({ users, currentUserId }: { users: PanelUser[]; currentUserId: string }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => (!role || user.role === role) && (!q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)));
  }, [users, query, role]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o correo…"
            aria-label="Buscar usuarios"
            className="h-10 w-full rounded-lg border border-ink-200 bg-surface pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
        </div>
        <label className="block space-y-1.5 sm:w-48">
          <span className="block text-xs font-medium text-ink-600">Rol</span>
          <select value={role} onChange={(event) => setRole(event.target.value)} className={cn(selectClass, "h-10")}>
            <option value="">Todos</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button className="sm:ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          Agregar usuario
        </Button>
      </div>

      <Card className="overflow-visible">
        {visible.length === 0 ? (
          <div className="p-5">
            <EmptyState title={users.length === 0 ? "Sin usuarios registrados" : "Sin resultados"} description={users.length === 0 ? undefined : "Ningún usuario coincide con la búsqueda o el rol."} />
          </div>
        ) : (
          <div className="md:overflow-visible">
            <table className="responsive-table data-table w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="rounded-tl-xl px-5 py-3">Usuario</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="rounded-tr-xl px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visible.map((user) => (
                  <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Agregar usuario" description="Crea un acceso al panel y define su rol.">
        {creating && <UserForm onDone={() => setCreating(false)} />}
      </Sheet>
    </div>
  );
}
