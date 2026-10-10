import { JoinPanel, loadJoinView } from "@/features/members";

export default async function JoinPage({ params }: PageProps<"/[locale]/emergencies/[slug]/join">) {
  const { slug } = await params;
  const view = await loadJoinView(slug);
  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow animate-enter flex-col justify-center px-4 py-16">
      <JoinPanel view={view} />
    </main>
  );
}
