"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/shared/i18n/navigation";
import { useAction } from "@/shared/lib/use-action";
import { FormError, IconButton } from "@/shared/ui";

import { setWorksiteMediaHiddenAction } from "../server/actions";

/** A coordinator's toggle under a gallery tile: hide it from the public, or show it again. */
export function HideMediaButton({ mediaId, hidden }: { mediaId: string; hidden: boolean }) {
  const t = useTranslations("worksiteMedia.gallery");
  const router = useRouter();
  const { run, isPending, error } = useAction();
  return (
    <>
      <IconButton
        variant="ghost"
        label={hidden ? t("show") : t("hide")}
        disabled={isPending}
        onClick={() =>
          run(
            () => setWorksiteMediaHiddenAction({ mediaId, hidden: !hidden }),
            () => router.refresh(),
          )
        }
      >
        {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
      </IconButton>
      {error ? <FormError size="field">{error}</FormError> : null}
    </>
  );
}
