"use client";

import { LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { Button, Spinner } from "@/shared/ui";

// Three decimals (~100 m): the URL can be shared, and the viewer's own position stays approximate.
const ORIGIN_DECIMALS = 3;

/** Asks for the phone's position once and adds distances to the list; the order stays by waiting. */
export function LocateButton() {
  const t = useTranslations("work.help");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "locating" | "denied">("idle");

  const locate = () => {
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const params = new URLSearchParams(searchParams);
        params.set(
          "near",
          `${coords.latitude.toFixed(ORIGIN_DECIMALS)},${coords.longitude.toFixed(ORIGIN_DECIMALS)}`,
        );
        params.delete("cursor");
        router.replace(`${pathname}?${params.toString()}`);
        setState("idle");
      },
      () => setState("denied"),
      { maximumAge: 60_000, timeout: 15_000 },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" className="self-start" onClick={locate} disabled={state === "locating"}>
        {state === "locating" ? <Spinner label={t("locating")} /> : <LocateFixed aria-hidden />}
        {t("showDistance")}
      </Button>
      {state === "denied" ? <p className="text-body-sm text-ink-muted">{t("locationDenied")}</p> : null}
    </div>
  );
}
