import { requireUser } from "@/lib/dal";
import { Sidebar } from "@/components/sidebar";
import { ALL_SECTIONS, canAccessSection } from "@/lib/permissions";
import { isServingDemoData } from "@/lib/env";

// See app/page.tsx: DEMO_MODE (and the login bypass it drives via
// requireUser) must be re-checked per request, not baked in at build time.
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const items = ALL_SECTIONS.filter(({ section }) => canAccessSection(user.role, section));
  const isDemoMode = isServingDemoData();

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar items={items} user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemoMode && (
          <div className="fixed inset-x-0 top-0 z-20 bg-gold-500 px-4 py-1.5 text-center text-xs font-medium text-ink-950 lg:pl-64">
            Modo demostración — Leads, Asesores y Usuarios muestran datos de ejemplo hasta
            conectar Google Sheets.
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pt-20 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
