"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FileButton, FileDrop } from "@/shared/ui";

/** FileDrop around a FileButton: drop or paste files and the count updates. */
export function FileDropDemo() {
  const t = useTranslations("devUi");
  const [count, setCount] = useState(0);
  return (
    <FileDrop onFiles={(files) => setCount(files.length)} className="p-3">
      <FileButton
        label={t("filePick")}
        multiple
        onChange={(event) => setCount(event.target.files?.length ?? 0)}
        className="self-start"
      />
      <p className="text-caption text-ink-muted">{t("fileDropHint", { count })}</p>
    </FileDrop>
  );
}
