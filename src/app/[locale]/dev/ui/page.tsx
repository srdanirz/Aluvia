import { House, LayoutGrid } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button, Card, CardBody, CardTitle, Field, FloatingNav, Input, ThemeSwitcher } from "@/shared/ui";

// Living catalog of shared/ui: every primitive and variant on one page, for review in both themes.
export default async function DesignSystemPage() {
  const t = await getTranslations("devUi");
  return (
    <>
      <FloatingNav
        label={t("navLabel")}
        items={[
          { href: "/", label: t("navHome"), icon: <House /> },
          { href: "/dev/ui", label: t("navCatalog"), icon: <LayoutGrid /> },
        ]}
      />
      <main className="mx-auto flex max-w-content flex-col gap-12 px-4 pt-16 pb-nav-bottom md:px-8 md:pt-nav-top md:pb-16">
        <header className="flex flex-col gap-4">
          <h1 className="font-display text-heading text-ink-strong">{t("title")}</h1>
          <p className="max-w-prose text-body text-ink-soft">{t("lead")}</p>
          <ThemeSwitcher />
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-subheading font-medium text-ink-strong">{t("buttons")}</h2>
          <div className="flex flex-wrap gap-3">
            <Button>{t("primary")}</Button>
            <Button variant="secondary">{t("secondary")}</Button>
            <Button variant="featured">{t("featured")}</Button>
            <Button variant="ghost">{t("ghost")}</Button>
            <Button disabled>{t("disabled")}</Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-subheading font-medium text-ink-strong">{t("fields")}</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Field id="address" label={t("addressLabel")} hint={t("addressHint")}>
              <Input autoComplete="street-address" />
            </Field>
            <Field id="phone" label={t("phoneLabel")}>
              <Input type="tel" inputMode="tel" autoComplete="tel" />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-subheading font-medium text-ink-strong">{t("cards")}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardTitle>{t("cardTitle")}</CardTitle>
              <CardBody>{t("cardBody")}</CardBody>
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}
