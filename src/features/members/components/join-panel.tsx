import { getLocale, getTranslations } from "next-intl/server";

import { LogOutButton } from "@/features/auth";
import { readLocalizedText } from "@/shared/i18n/localized-text";
import { Link } from "@/shared/i18n/navigation";
import { Button, Chip, GlassPanel } from "@/shared/ui";

import { joinEmergencyAction, requestMemberRoleAction } from "../server/actions";
import type { JoinView } from "../server/views";
import { ActionButton } from "./action-button";
import { RoleRequestForm } from "./role-request-form";

/** Joining an emergency: one primary action, whatever state the person is in. */
export async function JoinPanel({ view }: { view: JoinView }) {
  const t = await getTranslations("members.join");
  const tRoles = await getTranslations("roles");
  const locale = await getLocale();
  const { emergency, user, membership } = view;
  const name = readLocalizedText(emergency.name, locale, emergency.defaultLocale);
  const canRequest =
    user && emergency.status === "open" && membership?.role !== "coordinator" && !membership?.requestedRole;

  return (
    <GlassPanel className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-caption font-medium tracking-label text-ink-muted uppercase">{t("eyebrow")}</p>
        <h1 className="text-heading-sm text-ink">{name}</h1>
        <p className="text-body-sm text-ink-soft">{emergency.status === "open" ? t("lead") : t("closed")}</p>
      </header>

      {emergency.status === "open" && !user ? (
        <div className="flex flex-col gap-2">
          <Button block asChild>
            <Link href={{ pathname: "/login", query: { next: `/emergencies/${emergency.slug}/join` } }}>
              {t("start")}
            </Link>
          </Button>
          <p className="text-caption text-ink-muted">{t("startHint")}</p>
        </div>
      ) : null}

      {emergency.status === "open" && user && !membership ? (
        <ActionButton
          action={joinEmergencyAction.bind(null, locale, emergency.slug)}
          label={t("join")}
          variant="primary"
          block
        />
      ) : null}

      {membership ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">{t("joined", { role: tRoles(membership.role) })}</p>
          {membership.requestedRole ? (
            <Chip tone="pending" aria-label={t("requestedLabel")} className="w-fit">
              {t("requested", { role: tRoles(membership.requestedRole) })}
            </Chip>
          ) : null}
          <Button block asChild>
            <Link href={`/emergencies/${emergency.slug}`}>{t("open")}</Link>
          </Button>
        </div>
      ) : null}

      {canRequest ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-subheading font-medium text-ink">{t("requestTitle")}</h2>
          <p className="text-body-sm text-ink-soft">{t("requestLead")}</p>
          <RoleRequestForm
            action={requestMemberRoleAction.bind(null, locale, emergency.slug)}
            roles={
              membership?.role === "field_volunteer" ? ["coordinator"] : ["coordinator", "field_volunteer"]
            }
          />
        </section>
      ) : null}

      {user ? (
        <div className="flex justify-end">
          <LogOutButton />
        </div>
      ) : null}
    </GlassPanel>
  );
}
