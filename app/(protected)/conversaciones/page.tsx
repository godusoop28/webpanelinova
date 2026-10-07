import { requireSection } from "@/lib/dal";
import { canConfigureAssistant } from "@/lib/permissions";
import { InboxEmptyChat, InboxList, InboxShell, parseInboxParams } from "@/components/conversaciones/inbox";

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; f?: string; tab?: string }>;
}) {
  const user = await requireSection("conversaciones");
  const params = parseInboxParams(await searchParams);

  return (
    <InboxShell hasSelection={false} list={<InboxList params={params} basePath="/conversaciones" isAdmin={canConfigureAssistant(user.role)} />}>
      <InboxEmptyChat tab={params.tab} />
    </InboxShell>
  );
}
