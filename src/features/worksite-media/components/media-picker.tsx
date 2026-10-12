"use client";

import { ShieldAlert, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { FileButton, FileDrop, FormError, IconButton, MediaGallery, Section } from "@/shared/ui";

import { MEDIA_LIMITS } from "../schemas";
import { type PickError, type PickedMedia, prepareFiles } from "./prepare-media";

const ACCEPT = ["image/*", ...MEDIA_LIMITS.video.types].join(",");

/**
 * Pick up to 5 photos and 1 short video from the phone; on a computer, drop them on the section or
 * paste them too. The warning about faces, children and
 * documents sits above the button, so it is read before anything is chosen (edge cases doc).
 * Optional always: nothing here blocks sending the form.
 */
export function MediaPicker({
  value,
  onChange,
}: {
  value: PickedMedia[];
  onChange: (items: PickedMedia[]) => void;
}) {
  const t = useTranslations("worksiteMedia.picker");
  const [errors, setErrors] = useState<PickError[]>([]);
  const [preparing, setPreparing] = useState(false);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  // Object URLs live as long as the picker shows them.
  useEffect(() => () => latest.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const full =
    value.filter((item) => item.kind === "image").length >= MEDIA_LIMITS.image.perHome &&
    value.some((item) => item.kind === "video");

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setPreparing(true);
      // The picker is disabled while preparing, so `value` is still the current list here.
      const prepared = await prepareFiles(files, value);
      setPreparing(false);
      setErrors(prepared.errors);
      onChange([...value, ...prepared.items]);
    },
    [value, onChange],
  );
  const drop = useCallback((files: File[]) => void add(files), [add]);

  const remove = (id: string) => {
    const item = value.find((candidate) => candidate.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    onChange(value.filter((candidate) => candidate.id !== id));
  };

  return (
    <Section title={t("title")} lead={t("lead")}>
      <FileDrop onFiles={drop} disabled={preparing || full}>
        <p className="flex items-start gap-2 text-body-sm text-ink">
          <ShieldAlert aria-hidden className="size-icon-sm shrink-0" strokeWidth={1.5} />
          {t("warning")}
        </p>
        {value.length > 0 ? (
          <MediaGallery
            closeLabel={t("close")}
            items={value.map((item, index) => ({
              id: item.id,
              kind: item.kind,
              src: item.previewUrl,
              alt: t("itemAlt", { position: index + 1 }),
              action: (
                <IconButton variant="ghost" label={t("remove")} onClick={() => remove(item.id)}>
                  <Trash2 aria-hidden />
                </IconButton>
              ),
            }))}
          />
        ) : null}
        <FileButton
          label={preparing ? t("preparing") : t("add")}
          accept={ACCEPT}
          multiple
          disabled={preparing || full}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void add(files);
          }}
          className="self-start"
        />
        {/* Only where a mouse can drag; a phone picks with the button. */}
        <p className="hidden text-caption text-ink-muted pointer-fine:block">{t("dropHint")}</p>
        {errors.map((code) => (
          <FormError key={code} size="field">
            {t(`errors.${code}`)}
          </FormError>
        ))}
      </FileDrop>
    </Section>
  );
}
