import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listUsers } from "@/lib/services/user.service";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { NewUserForm } from "@/components/usuarios/new-user-form";
import { UserRow } from "@/components/usuarios/user-row";

export default async function UsuariosPage() {
  const currentUser = await requireRole("ADMIN");

  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let loadError: string | null = null;
  try {
    const companyId = await getDefaultCompanyId();
    users = await listUsers(companyId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Usuarios</h1>
        <p className="text-sm text-ink-500">Controla quién puede iniciar sesión en el panel y con qué rol.</p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Agregar usuario</h2>
        <NewUserForm />
      </Card>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorState title="No se pudieron cargar los usuarios" description={loadError} />
          </div>
        ) : users.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sin usuarios registrados" />
          </div>
        ) : (
          <div className="md:overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserRow key={user.id} user={user} isSelf={user.id === currentUser.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
