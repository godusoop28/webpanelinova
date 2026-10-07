import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listUsers } from "@/lib/services/user.service";
import { Card, SectionHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/state";
import { UsersBoard } from "@/components/usuarios/users-board";
import { RolesOverview } from "@/components/roles-overview";

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
      <PageHeader title="Usuarios" description="Administra quién puede iniciar sesión en el panel y con qué rol." />

      {loadError ? (
        <ErrorState title="No se pudieron cargar los usuarios" description={loadError} />
      ) : (
        <UsersBoard
          currentUserId={currentUser.id}
          users={users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active }))}
        />
      )}

      <Card>
        <SectionHeader
          icon={ShieldCheck}
          title="Roles del sistema"
          description="Debe quedar al menos un ADMIN activo; nadie puede desactivar ni eliminar su propia cuenta."
        />
        <div className="px-5 pb-5">
          <RolesOverview />
        </div>
      </Card>
    </div>
  );
}
