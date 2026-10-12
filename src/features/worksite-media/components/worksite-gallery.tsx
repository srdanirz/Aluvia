import { getFormatter, getTranslations } from "next-intl/server";

import { canViewContacts, getEmergencyAccess } from "@/shared/auth";
import { Chip, MediaGallery, Section } from "@/shared/ui";

import { listWorksiteMedia } from "../server/list-worksite-media";
import { isMediaEnabled } from "../server/media-enabled";
import { HideMediaButton } from "./hide-media-button";
import { MediaUploader } from "./media-uploader";

/**
 * A home's photos and videos with the way to add more (ADR 0020). The public sees what nobody
 * hid; a coordinator also sees hidden items, faded, with the toggle to hide or show each one.
 * Renders nothing when media is off (no bucket configured).
 */
export async function WorksiteGallery({
  slug,
  emergencyId,
  worksiteId,
  now,
}: {
  slug: string;
  emergencyId: string;
  worksiteId: string;
  /** The request's clock, shared with the rest of the page. */
  now: Date;
}) {
  if (!isMediaEnabled()) return null;
  const access = await getEmergencyAccess(emergencyId);
  const moderates = Boolean(access && (canViewContacts(access) || access.isPlatformAdmin));
  const [items, t, format] = await Promise.all([
    listWorksiteMedia({ worksiteId, includeHidden: moderates }),
    getTranslations("worksiteMedia.gallery"),
    getFormatter(),
  ]);
  return (
    <Section title={t("title")}>
      {items.length > 0 ? (
        <MediaGallery
          closeLabel={t("close")}
          items={items.map((item, index) => ({
            id: item.id,
            kind: item.kind,
            src: item.url,
            alt: t("itemAlt", { position: index + 1 }),
            muted: item.hidden,
            // When it arrived, not when it was taken: the photo's own date went with its EXIF.
            caption: t("received", { relative: format.relativeTime(item.createdAt, now) }),
            badge: item.hidden ? <Chip tone="closed">{t("hidden")}</Chip> : undefined,
            action: moderates ? <HideMediaButton mediaId={item.id} hidden={item.hidden} /> : undefined,
          }))}
        />
      ) : (
        <p className="text-body-sm text-ink-soft">{t("empty")}</p>
      )}
      <MediaUploader slug={slug} worksiteId={worksiteId} />
    </Section>
  );
}
