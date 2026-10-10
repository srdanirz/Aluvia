import { LoginForm, loadLoginView } from "@/features/auth";
import { GlassPanel, Logo } from "@/shared/ui";

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const { next } = await searchParams;
  const { nextPath, initialState } = await loadLoginView(next);

  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow animate-enter flex-col justify-center gap-8 px-4 py-16">
      <Logo className="h-8 self-start" />
      <GlassPanel>
        <LoginForm next={nextPath} initialState={initialState} />
      </GlassPanel>
    </main>
  );
}
