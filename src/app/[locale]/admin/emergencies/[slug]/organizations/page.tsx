import { loadOrganizationsAdminView, OrganizationsAdmin } from "@/features/organizations";

export default async function OrganizationsAdminPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/emergencies/[slug]/organizations">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const view = await loadOrganizationsAdminView(
    slug,
    typeof query.after === "string" ? query.after : undefined,
  );
  return (
    <div className="animate-enter">
      <OrganizationsAdmin view={view} />
    </div>
  );
}
