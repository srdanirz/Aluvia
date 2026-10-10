import { LoginForm, loadLoginView } from "@/features/auth";
import { GlassPanel, Logo, Page } from "@/shared/ui";

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const { next } = await searchParams;
  const { nextPath, initialState } = await loadLoginView(next);

  return (
    <Page nav={false} align="center" className="animate-enter">
      <Logo className="h-8 self-start" />
      <GlassPanel>
        <LoginForm next={nextPath} initialState={initialState} />
      </GlassPanel>
    </Page>
  );
}
