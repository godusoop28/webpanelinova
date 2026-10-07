import { requireSection } from "@/lib/dal";
import { canConfigureAssistant } from "@/lib/permissions";
import { InboxEmptyChat, InboxPage, parseInboxParams } from "@/components/conversaciones/inbox";

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; f?: string; tab?: string; sel?: string }>;
}) {
  const user = await requireSection("conversaciones");
  const raw = await searchParams;
  const params = parseInboxParams(raw);

  return (
    <InboxPage params={params} isAdmin={canConfigureAssistant(user.role)} hasSelection={false} selectedId={raw.sel}>
      <InboxEmptyChat tab={params.tab} />
    </InboxPage>
  );
}
