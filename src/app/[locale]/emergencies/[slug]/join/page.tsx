import { JoinPanel, loadJoinView } from "@/features/members";
import { Page } from "@/shared/ui";

export default async function JoinPage({
  params,
  searchParams,
}: PageProps<"/[locale]/emergencies/[slug]/join">) {
  const [{ slug }, { next }] = await Promise.all([params, searchParams]);
  const view = await loadJoinView(slug, next);
  return (
    <Page align="center" className="animate-enter">
      <JoinPanel view={view} />
    </Page>
  );
}
