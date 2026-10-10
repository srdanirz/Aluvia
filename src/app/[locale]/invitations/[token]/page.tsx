import { InvitationPanel, loadInvitationView } from "@/features/members";

export default async function InvitationPage({ params }: PageProps<"/[locale]/invitations/[token]">) {
  const { token } = await params;
  const view = await loadInvitationView(token);
  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow animate-enter flex-col justify-center px-4 py-16">
      <InvitationPanel view={view} token={token} />
    </main>
  );
}
