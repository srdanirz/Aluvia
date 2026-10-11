import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/features/admin";
import { ActionButton, InvitationForm, revokeMemberRoleAction } from "@/features/members";
import { Link } from "@/shared/i18n/navigation";
import { Button, Card, CardBody, CardTitle, Section } from "@/shared/ui";

import type { loadOrganizationsAdminView } from "../server/views";
import { OrganizationForm } from "./organization-form";

type View = Awaited<ReturnType<typeof loadOrganizationsAdminView>>;

/**
 * The admin's organizations screen (ADR 0019): create a group, invite its coordinators with the
 * members' invitation links, and take the role back from one of them.
 */
export async function OrganizationsAdmin({ view }: { view: View }) {
  const t = await getTranslations("organizations.admin");
  const format = await getFormatter();
  const locale = await getLocale();
  const { emergency, organizations } = view;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={t("title")} lead={t("lead")} />

      {emergency.isOpen ? (
        <Card>
          <OrganizationForm emergencyId={emergency.id} />
        </Card>
      ) : (
        <p className="text-body-sm text-ink-muted">{t("closed")}</p>
      )}

      <Section title={t("list")}>
        {organizations.items.length === 0 ? (
          <p className="text-body-sm text-ink-muted">{t("empty")}</p>
        ) : null}
        <div className="flex flex-col gap-6">
          {organizations.items.map((organization) => (
            <Card key={organization.id} className="gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle>{organization.name}</CardTitle>
                {organization.publicContact ? <CardBody>{organization.publicContact}</CardBody> : null}
                <CardBody>
                  {t("createdOn", {
                    date: format.dateTime(organization.createdAt, {
                      dateStyle: "medium",
                      timeZone: emergency.timeZone,
                    }),
                  })}
                </CardBody>
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-subheading font-medium text-ink">
                  {t("coordinators", { count: organization.coordinatorCount })}
                </h3>
                {organization.coordinators.length === 0 ? (
                  <p className="text-body-sm text-ink-muted">{t("noCoordinators")}</p>
                ) : null}
                {organization.coordinators.map((coordinator) => (
                  <div key={coordinator.userId} className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-body text-ink">{coordinator.name ?? t("unnamed")}</p>
                    <ActionButton
                      action={revokeMemberRoleAction.bind(null, locale, {
                        emergencyId: emergency.id,
                        userId: coordinator.userId,
                      })}
                      label={t("remove")}
                    />
                  </div>
                ))}
              </div>
              {emergency.isOpen ? (
                <InvitationForm emergencyId={emergency.id} organizationId={organization.id} />
              ) : null}
            </Card>
          ))}
        </div>
        {organizations.nextCursor ? (
          <div>
            <Button variant="ghost" asChild>
              <Link
                href={{
                  pathname: `/admin/emergencies/${emergency.slug}/organizations`,
                  query: { after: organizations.nextCursor },
                }}
              >
                {t("more")}
              </Link>
            </Button>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
