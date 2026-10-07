import { requireUser } from "@/lib/dal";
import { Sidebar } from "@/components/sidebar";
import { MainContainer } from "@/components/main-container";
import { ALL_SECTIONS, canAccessSection, type PanelSection } from "@/lib/permissions";
import { isInternalTestingEnabled } from "@/lib/env";
import { getDefaultCompanyId } from "@/lib/company";
import { countOpenEscalations } from "@/lib/services/conversation-admin.service";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const testingEnabled = isInternalTestingEnabled();
  const items = ALL_SECTIONS.filter(
    ({ section }) => (section !== "testing" || testingEnabled) && canAccessSection(user.role, section)
  );

  const badges: Partial<Record<PanelSection, number>> = {};
  if (canAccessSection(user.role, "conversaciones")) {
    try {
      badges.conversaciones = await countOpenEscalations(await getDefaultCompanyId());
    } catch {
      // el contador es decorativo: si falla, el menú se muestra sin él
    }
  }

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      <Sidebar items={items} user={user} badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MainContainer>{children}</MainContainer>
      </div>
    </div>
  );
}
