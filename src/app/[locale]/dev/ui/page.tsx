import { House, LayoutGrid, MessageCircle, Navigation, Phone, Search, Share2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import {
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardTitle,
  Chip,
  Field,
  FloatingNav,
  GlassPanel,
  IconButton,
  Input,
  Skeleton,
  Spinner,
  ThemeSwitcher,
} from "@/shared/ui";

import { SegmentedDemo } from "./segmented-demo";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-subheading font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

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
      <main className="mx-auto flex max-w-content animate-enter flex-col gap-12 px-4 pt-16 pb-nav-bottom md:px-8 md:pt-nav-top md:pb-16">
        <header className="flex flex-col gap-4">
          <h1 className="text-heading text-ink md:text-display">
            {t.rich("title", { highlight: (chunks) => <span className="text-iridescent">{chunks}</span> })}
          </h1>
          <p className="max-w-prose text-body text-ink-soft">{t("lead")}</p>
          <ThemeSwitcher />
        </header>

        <Section title={t("buttons")}>
          <div className="flex flex-wrap gap-3">
            <Button>{t("primary")}</Button>
            <Button variant="secondary">{t("secondary")}</Button>
            <Button variant="accent">{t("accent")}</Button>
            <Button variant="ghost">{t("ghost")}</Button>
            <Button disabled>{t("disabled")}</Button>
            <Button variant="secondary" disabled>
              <Spinner label={t("saving")} />
              {t("saving")}
            </Button>
          </div>
        </Section>

        <Section title={t("iconButtons")}>
          <div className="flex flex-wrap gap-3">
            <IconButton label={t("search")}>
              <Search />
            </IconButton>
            <IconButton label={t("call")} variant="urgent">
              <Phone />
            </IconButton>
            <IconButton label={t("message")} variant="pending">
              <MessageCircle />
            </IconButton>
            <IconButton label={t("navHome")} variant="solid">
              <House />
            </IconButton>
          </div>
        </Section>

        <Section title={t("groups")}>
          <div className="flex flex-wrap items-center gap-4">
            <ButtonGroup label={t("groupLabel")}>
              <IconButton label={t("call")} variant="ghost">
                <Phone />
              </IconButton>
              <IconButton label={t("directions")} variant="solid">
                <Navigation />
              </IconButton>
              <IconButton label={t("message")} variant="ghost">
                <MessageCircle />
              </IconButton>
              <IconButton label={t("share")} variant="ghost">
                <Share2 />
              </IconButton>
            </ButtonGroup>
            <ButtonGroup label={t("groupLabel")}>
              <Button variant="ghost">{t("call")}</Button>
              <Button>{t("directions")}</Button>
              <Button variant="ghost">{t("share")}</Button>
            </ButtonGroup>
          </div>
        </Section>

        <Section title={t("chips")}>
          <div className="flex flex-wrap gap-2">
            <Chip tone="urgent">{t("urgent")}</Chip>
            <Chip tone="pending">{t("pending")}</Chip>
            <Chip tone="done">{t("done")}</Chip>
            <Chip tone="closed">{t("closed")}</Chip>
            <Chip>{t("neutral")}</Chip>
          </div>
        </Section>

        <Section title={t("segmented")}>
          <SegmentedDemo label={t("viewLabel")} open={t("viewOpen")} taken={t("viewTaken")} />
        </Section>

        <Section title={t("cards")}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card interactive>
              <div className="flex items-start justify-between gap-3">
                <CardTitle>{t("cardTitle")}</CardTitle>
                <Chip tone="urgent">{t("urgent")}</Chip>
              </div>
              <CardBody>{t("cardBody")}</CardBody>
            </Card>
            <Card selected>
              <div className="flex items-start justify-between gap-3">
                <CardTitle>{t("cardSelected")}</CardTitle>
                <Chip tone="pending">{t("pending")}</Chip>
              </div>
              <CardBody>{t("cardBody")}</CardBody>
              <div className="flex items-center justify-end gap-2 pt-2">
                <IconButton label={t("call")} variant="urgent">
                  <Phone />
                </IconButton>
                <IconButton label={t("message")} variant="pending">
                  <MessageCircle />
                </IconButton>
              </div>
              <Button block>{t("primary")}</Button>
            </Card>
          </div>
        </Section>

        <Section title={t("glass")}>
          <GlassPanel className="flex max-w-narrow flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-heading-sm text-ink">{t("glassTitle")}</h3>
              <Chip tone="pending">{t("pending")}</Chip>
            </div>
            <p className="text-body-sm text-ink-soft">{t("glassBody")}</p>
          </GlassPanel>
        </Section>

        <Section title={t("fields")}>
          <div className="grid gap-6 md:grid-cols-2">
            <Field id="address" label={t("addressLabel")} hint={t("addressHint")}>
              <Input autoComplete="street-address" />
            </Field>
            <Field id="phone" label={t("phoneLabel")} error={t("phoneError")}>
              <Input type="tel" inputMode="tel" autoComplete="tel" />
            </Field>
          </div>
        </Section>

        <Section title={t("loading")}>
          <Card className="max-w-narrow">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-6 w-1/4 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        </Section>
      </main>
    </>
  );
}
