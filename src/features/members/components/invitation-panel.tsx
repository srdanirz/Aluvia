import { getLocale, getTranslations } from "next-intl/server";

import { readLocalizedText } from "@/shared/i18n/localized-text";
import { Link } from "@/shared/i18n/navigation";
import { Button, GlassPanel } from "@/shared/ui";

import { acceptInvitationAction } from "../server/actions";
import type { InvitationPageView } from "../server/views";
import { ActionButton } from "./action-button";

/** What an invitation link offers, and the one button that accepts it. */
export async function InvitationPanel({ view, token }: { view: InvitationPageView; token: string }) {
  const t = await getTranslations("members.invitation");
  const tRoles = await getTranslations("roles");
  const tErrors = await getTranslations("errors");
  const locale = await getLocale();
  const { invitation, user } = view;
  const emergency = readLocalizedText(invitation.emergency.name, locale, invitation.emergency.defaultLocale);

  if (invitation.status !== "valid") {
    return (
      <GlassPanel className="flex flex-col gap-2">
        <h1 className="text-heading-sm text-ink">{t("unavailable")}</h1>
        <p className="text-body-sm text-ink-soft">{tErrors(invitation.status)}</p>
        <p className="text-body-sm text-ink-soft">{t("askAgain")}</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-caption font-medium tracking-label text-ink-muted uppercase">{t("eyebrow")}</p>
        <h1 className="text-heading-sm text-ink">{t("title", { emergency })}</h1>
        <p className="text-body-sm text-ink-soft">{t("lead", { role: tRoles(invitation.role) })}</p>
      </header>
      {user?.name ? (
        <ActionButton
          action={acceptInvitationAction.bind(null, locale, token)}
          label={t("accept")}
          variant="primary"
          block
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Button block asChild>
            <Link href={{ pathname: "/login", query: { next: `/invitations/${token}` } }}>{t("accept")}</Link>
          </Button>
          <p className="text-caption text-ink-muted">{t("acceptHint")}</p>
        </div>
      )}
    </GlassPanel>
  );
}
