import { InvitationPanel, loadInvitationView } from "@/features/members";
import { Page } from "@/shared/ui";

export default async function InvitationPage({ params }: PageProps<"/[locale]/invitations/[token]">) {
  const { token } = await params;
  const view = await loadInvitationView(token);
  return (
    <Page nav={false} align="center" className="animate-enter">
      <InvitationPanel view={view} token={token} />
    </Page>
  );
}
