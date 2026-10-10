import { loadMembersAdminView, MembersAdmin } from "@/features/members";

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function MembersAdminPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/emergencies/[slug]/members">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const view = await loadMembersAdminView(slug, {
    pending: single(query.pending),
    members: single(query.members),
    invitations: single(query.invitations),
  });
  return (
    <main className="mx-auto flex max-w-content animate-enter flex-col px-4 pt-16 pb-nav-bottom md:px-8 md:pt-nav-top md:pb-16">
      <MembersAdmin view={view} />
    </main>
  );
}
