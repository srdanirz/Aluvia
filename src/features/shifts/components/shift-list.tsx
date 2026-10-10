import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/shared/i18n/navigation";
import { Button, Card, CardBody, CardTitle, Chip } from "@/shared/ui";

import type { ShiftViewer, UpcomingShift } from "../server";
import { SignupButton } from "./signup-button";

/** Upcoming shifts with their seats; times in the emergency's zone (STYLEGUIDE, Datos). */
export async function ShiftList({
  slug,
  emergencyId,
  timeZone,
  shifts,
  viewer,
}: {
  slug: string;
  emergencyId: string;
  timeZone: string;
  shifts: UpcomingShift[];
  viewer: ShiftViewer;
}) {
  const t = await getTranslations("shifts");
  const format = await getFormatter();

  if (shifts.length === 0) {
    return (
      <Card>
        <CardTitle>{t("emptyTitle")}</CardTitle>
        <CardBody>{t("emptyBody")}</CardBody>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {shifts.map((shift) => {
        const isFull = shift.filled >= shift.capacity;
        return (
          <li key={shift.id}>
            <Card className="gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {shift.isSignedUp ? <Chip tone="done">{t("signedUp")}</Chip> : null}
                <Chip tone={isFull ? "closed" : "pending"}>
                  {isFull ? t("full") : t("seats", { filled: shift.filled, capacity: shift.capacity })}
                </Chip>
                {shift.workType ? <Chip>{shift.workType}</Chip> : null}
              </div>
              <CardTitle>
                {t("when", {
                  start: format.dateTime(shift.startsAt, { dateStyle: "full", timeStyle: "short", timeZone }),
                  end: format.dateTime(shift.endsAt, { timeStyle: "short", timeZone }),
                })}
              </CardTitle>
              <CardBody>{t("meetingPoint", { place: shift.meetingPoint })}</CardBody>
              {viewer === "member" ? (
                <SignupButton
                  emergencyId={emergencyId}
                  shiftId={shift.id}
                  isSignedUp={shift.isSignedUp}
                  isFull={isFull}
                />
              ) : (
                <Button variant="accent" block asChild>
                  {viewer === "anonymous" ? (
                    <Link href={{ pathname: "/login", query: { next: `/emergencies/${slug}/shifts` } }}>
                      {t("signIn")}
                    </Link>
                  ) : (
                    <Link href={`/emergencies/${slug}/join`}>{t("join")}</Link>
                  )}
                </Button>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
