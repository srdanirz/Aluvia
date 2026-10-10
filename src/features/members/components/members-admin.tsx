import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { LogOutButton } from "@/features/auth";
import { readLocalizedText } from "@/shared/i18n/localized-text";
import { Link } from "@/shared/i18n/navigation";
import type { Page } from "@/shared/lib/pagination";
import { Button, Card, CardBody, CardTitle, Chip } from "@/shared/ui";

import {
  approveMemberRoleAction,
  rejectMemberRoleAction,
  revokeInvitationAction,
  revokeMemberRoleAction,
} from "../server/actions";
import type { loadMembersAdminView } from "../server/views";
import { ActionButton } from "./action-button";
import { InvitationForm } from "./invitation-form";

type View = Awaited<ReturnType<typeof loadMembersAdminView>>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-subheading font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** "Show more" for one list; keeps the other lists where they were. */
async function MoreLink({
  page,
  param,
  view,
}: {
  page: Page<unknown>;
  param: keyof View["cursors"];
  view: View;
}) {
  const t = await getTranslations("members.admin");
  if (!page.nextCursor) return null;
  const query = Object.fromEntries(
    Object.entries({ ...view.cursors, [param]: page.nextCursor }).filter(([, value]) => value !== undefined),
  );
  return (
    <div>
      <Button variant="ghost" asChild>
        <Link href={{ pathname: `/admin/emergencies/${view.emergency.slug}/members`, query }}>
          {t("more")}
        </Link>
      </Button>
    </div>
  );
}

/** The admin's members screen: pending requests, people with a role, and invitation links. */
export async function MembersAdmin({ view }: { view: View }) {
  const t = await getTranslations("members.admin");
  const tRoles = await getTranslations("roles");
  const format = await getFormatter();
  const locale = await getLocale();
  const { emergency, pending, members, invitations } = view;
  const date = (value: Date) => format.dateTime(value, { dateStyle: "medium", timeZone: emergency.timeZone });
  const target = (userId: string) => ({ emergencyId: emergency.id, userId });

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading text-ink">
          {t("title", { emergency: readLocalizedText(emergency.name, locale, emergency.defaultLocale) })}
        </h1>
        <p className="max-w-prose text-body text-ink-soft">{t("lead")}</p>
        <div>
          <LogOutButton />
        </div>
      </header>

      <Section title={t("requests")}>
        {pending.items.length === 0 ? <p className="text-body-sm text-ink-muted">{t("noRequests")}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {pending.items.map((request) => (
            <Card key={request.userId}>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{request.name ?? t("unnamed")}</CardTitle>
                <Chip tone="pending">{tRoles(request.requestedRole)}</Chip>
              </div>
              <CardBody>{request.phone}</CardBody>
              <CardBody>{t("requestedOn", { date: date(request.createdAt) })}</CardBody>
              <div className="flex flex-wrap gap-2 pt-2">
                <ActionButton
                  action={approveMemberRoleAction.bind(null, {
                    ...target(request.userId),
                    role: request.requestedRole,
                  })}
                  label={t("approve")}
                  variant="primary"
                />
                <ActionButton
                  action={rejectMemberRoleAction.bind(null, target(request.userId))}
                  label={t("reject")}
                />
              </div>
            </Card>
          ))}
        </div>
        <MoreLink page={pending} param="pending" view={view} />
      </Section>

      <Section title={t("members")}>
        {members.items.length === 0 ? <p className="text-body-sm text-ink-muted">{t("noMembers")}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {members.items.map((member) => (
            <Card key={member.userId}>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{member.name ?? t("unnamed")}</CardTitle>
                <Chip tone="done">{tRoles(member.role)}</Chip>
              </div>
              <CardBody>{t("approvedOn", { date: date(member.approvedAt) })}</CardBody>
              {member.role === "field_volunteer" ? (
                <CardBody>{t("assignedHomes", { count: member.assignedWorksites })}</CardBody>
              ) : null}
              <div className="pt-2">
                <ActionButton
                  action={revokeMemberRoleAction.bind(null, target(member.userId))}
                  label={t("revoke")}
                />
              </div>
            </Card>
          ))}
        </div>
        <MoreLink page={members} param="members" view={view} />
      </Section>

      <Section title={t("invitations")}>
        <Card>
          <InvitationForm emergencyId={emergency.id} />
        </Card>
        {invitations.items.length === 0 ? (
          <p className="text-body-sm text-ink-muted">{t("noInvitations")}</p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {invitations.items.map((invitation) => (
            <Card key={invitation.id}>
              <CardTitle>
                {t("invitationSummary", { role: tRoles(invitation.role), date: date(invitation.expiresAt) })}
              </CardTitle>
              <CardBody>
                {t("invitationUses", { uses: invitation.uses, max: invitation.maxUses ?? "unlimited" })}
              </CardBody>
              {invitation.worksites > 0 ? (
                <CardBody>{t("invitationHomes", { count: invitation.worksites })}</CardBody>
              ) : null}
              <div className="pt-2">
                <ActionButton
                  action={revokeInvitationAction.bind(null, {
                    emergencyId: emergency.id,
                    invitationId: invitation.id,
                  })}
                  label={t("revokeInvitation")}
                />
              </div>
            </Card>
          ))}
        </div>
        <MoreLink page={invitations} param="invitations" view={view} />
      </Section>
    </div>
  );
}
