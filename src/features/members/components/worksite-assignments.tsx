import { getTranslations } from "next-intl/server";

import { Card, CardBody, CardTitle, Chip } from "@/shared/ui";

import { assignWorksiteAction, unassignWorksiteAction } from "../server/actions";
import { loadWorksiteAssignmentsView } from "../server/views";
import { ActionButton } from "./action-button";
import { WorksiteInviteButton } from "./worksite-invite-button";

/**
 * Field volunteers of one home, for the home's page. Renders nothing unless the viewer is a
 * platform admin; it reads the session, so it belongs under the route's loading.tsx.
 */
export async function WorksiteAssignments({
  emergencyId,
  worksiteId,
}: {
  emergencyId: string;
  worksiteId: string;
}) {
  const view = await loadWorksiteAssignmentsView({ emergencyId, worksiteId });
  if (!view) return null;
  const t = await getTranslations("members.assignments");
  const tAdmin = await getTranslations("members.admin");

  return (
    <Card className="gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t("title")}</CardTitle>
        <CardBody>{t("lead")}</CardBody>
      </div>
      {view.volunteers.length === 0 ? <CardBody>{t("empty")}</CardBody> : null}
      <ul className="flex flex-col gap-3">
        {view.volunteers.map((volunteer) => {
          const target = { emergencyId, worksiteId, userId: volunteer.userId };
          return (
            <li key={volunteer.userId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-body-sm text-ink">
                {volunteer.name ?? tAdmin("unnamed")}
                {volunteer.isAssigned ? <Chip tone="done">{t("assigned")}</Chip> : null}
              </span>
              {volunteer.isAssigned ? (
                <ActionButton
                  action={unassignWorksiteAction.bind(null, target)}
                  label={t("unassign")}
                  variant="ghost"
                />
              ) : (
                <ActionButton action={assignWorksiteAction.bind(null, target)} label={t("assign")} />
              )}
            </li>
          );
        })}
      </ul>
      <WorksiteInviteButton emergencyId={emergencyId} worksiteId={worksiteId} />
    </Card>
  );
}
