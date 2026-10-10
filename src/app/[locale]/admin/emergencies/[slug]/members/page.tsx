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
    <div className="animate-enter">
      <MembersAdmin view={view} />
    </div>
  );
}
