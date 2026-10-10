import { JoinPanel, loadJoinView } from "@/features/members";
import { Page } from "@/shared/ui";

export default async function JoinPage({ params }: PageProps<"/[locale]/emergencies/[slug]/join">) {
  const { slug } = await params;
  const view = await loadJoinView(slug);
  return (
    <Page align="center" className="animate-enter">
      <JoinPanel view={view} />
    </Page>
  );
}
