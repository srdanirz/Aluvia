"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button, Field, FileButton } from "@/shared/ui";

import { areaSchema } from "../area";

type AreaFileFieldProps = {
  id: string;
  /** The file's text once it parses as polygons, or null when cleared. */
  onChange: (geoJson: string | null) => void;
  error?: string;
};

/**
 * Uploads the area as a GeoJSON file, the fallback ADR 0009 names for when the map cannot draw.
 * The file is checked here for an early answer; the server checks it again.
 */
export function AreaFileField({ id, onChange, error }: AreaFileFieldProps) {
  const t = useTranslations("admin.emergencies");
  const tErrors = useTranslations("errors");
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error;

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = areaSchema.safeParse(text);
    if (parsed.success) {
      setLocalError(null);
      setFileName(file.name);
      onChange(text);
    } else {
      setFileName(null);
      onChange(null);
      setLocalError(
        tErrors(parsed.error.issues[0]?.message === "area_too_large" ? "area_too_large" : "invalid_geojson"),
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Field
        id={id}
        label={t("areaLabel")}
        hint={fileName ? t("areaLoaded", { file: fileName }) : t("areaHint")}
        error={shownError ?? undefined}
      >
        <FileButton
          label={t("areaPick")}
          accept=".geojson,.json,application/geo+json,application/json"
          className="self-start"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </Field>
      {fileName ? (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            setFileName(null);
            onChange(null);
          }}
        >
          <X aria-hidden />
          {t("areaRemove")}
        </Button>
      ) : null}
    </div>
  );
}
