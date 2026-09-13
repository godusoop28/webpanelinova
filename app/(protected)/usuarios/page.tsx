import { requireRole } from "@/lib/dal";
import { getAuthorizedUsers } from "@/lib/google-sheets";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { NewUserForm } from "@/components/usuarios/new-user-form";
import { UserRow } from "@/components/usuarios/user-row";

export default async function UsuariosPage() {
  await requireRole("ADMIN");

  let users: Awaited<ReturnType<typeof getAuthorizedUsers>> = [];
  let loadError: string | null = null;
  try {
    users = await getAuthorizedUsers();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Usuarios</h1>
        <p className="text-sm text-ink-500">
          Controla quién puede iniciar sesión en el panel y con qué rol, directamente
          sobre la pestaña Usuarios de Google Sheets.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Agregar usuario</h2>
        <NewUserForm />
      </Card>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorState title="No se pudo cargar Google Sheets" description={loadError} />
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
                  <UserRow key={user.correo || user.rowNumber} user={user} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
