import { requireUser } from "@/lib/dal";
import { Sidebar } from "@/components/sidebar";
import { ALL_SECTIONS, canAccessSection } from "@/lib/permissions";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const items = ALL_SECTIONS.filter(({ section }) => canAccessSection(user.role, section));

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar items={items} user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pt-20 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
