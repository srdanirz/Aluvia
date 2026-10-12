"use client";

import { Clock, MapPin, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Directions } from "@/features/map/components/directions";
import { useAction } from "@/shared/lib/use-action";
import {
  Button,
  Chip,
  CollectionPointStatusChip,
  Field,
  FormError,
  GlassPanel,
  IconButton,
  Input,
  SegmentedControl,
} from "@/shared/ui";

import { COLLECTION_POINT_STATUSES, type CollectionPointStatus } from "../schemas";
import { removeCollectionPointAction, updateCollectionPointAction } from "../server/actions";
import type { MapCollectionPoint, SupplyOption } from "../server/collection-points";
import { SupplyToggles } from "./supply-toggles";

/**
 * A tapped point: status, hours, what it takes, what not to bring, its phone and how to get there. Coordinators
 * change its status (against the version they saw) or remove it from here.
 */
export function CollectionPointPanel({
  slug,
  point,
  supplyTypes,
  canEdit,
  onClose,
  onChanged,
}: {
  slug: string;
  point: MapCollectionPoint;
  supplyTypes: SupplyOption[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("collectionPoints");
  const { run, isPending, error } = useAction();
  const [edit, setEdit] = useState<{
    version: number;
    status: CollectionPointStatus;
    statusNote: string;
    accepts: string[];
    surplus: string[];
  } | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const names = new Map(supplyTypes.map((type) => [type.key, type.name]));
  const activeKeys = new Set(supplyTypes.filter((type) => type.isActive).map((type) => type.key));

  function save() {
    if (!edit) return;
    run(
      async () => {
        const result = await updateCollectionPointAction({
          id: point.id,
          slug,
          version: edit.version,
          status: edit.status,
          statusNote: edit.statusNote.trim() || null,
          accepts: edit.accepts,
          surplus: edit.surplus,
        });
        // Someone else saved first: show what they saved; the coordinator edits from there.
        if (!result.ok && result.code === "stale_version") {
          setEdit(null);
          onChanged();
        }
        return result;
      },
      () => {
        setEdit(null);
        onChanged();
      },
    );
  }

  return (
    <GlassPanel className="flex max-h-sheet flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <p className="text-body font-medium text-ink">{point.name}</p>
          <CollectionPointStatusChip status={point.status}>
            {t(`statuses.${point.status}`)}
          </CollectionPointStatusChip>
        </div>
        <IconButton variant="ghost" label={t("close")} onClick={onClose}>
          <X />
        </IconButton>
      </div>

      {edit ? (
        <>
          <SegmentedControl
            label={t("statusLabel")}
            value={edit.status}
            onChange={(status) => setEdit({ ...edit, status })}
            options={COLLECTION_POINT_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))}
          />
          <Field id="collection-point-status-note" label={t("statusNoteLabel")}>
            <Input
              value={edit.statusNote}
              maxLength={200}
              onChange={(event) => setEdit({ ...edit, statusNote: event.target.value })}
            />
          </Field>
          <SupplyToggles
            label={t("acceptsLabel")}
            supplyTypes={supplyTypes}
            value={edit.accepts}
            onChange={(accepts) => setEdit({ ...edit, accepts })}
          />
          <SupplyToggles
            label={t("surplusLabel")}
            hint={t("surplusHint")}
            supplyTypes={supplyTypes}
            value={edit.surplus}
            onChange={(surplus) => setEdit({ ...edit, surplus })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isPending} onClick={() => setEdit(null)}>
              {t("cancel")}
            </Button>
            <Button variant="primary" disabled={isPending} onClick={save}>
              {t("save")}
            </Button>
          </div>
        </>
      ) : (
        <>
          {point.statusNote ? <p className="text-body-sm text-ink">{point.statusNote}</p> : null}
          {point.openingHours ? (
            <p className="flex items-center gap-2 text-body-sm text-ink-soft">
              <Clock aria-hidden className="size-icon-sm shrink-0" />
              {point.openingHours}
            </p>
          ) : null}
          {point.address ? (
            <p className="flex items-center gap-2 text-body-sm text-ink-soft">
              <MapPin aria-hidden className="size-icon-sm shrink-0" />
              {point.address}
            </p>
          ) : null}
          {point.accepts.length > 0 ? (
            <div className="flex flex-wrap gap-1" aria-label={t("acceptsLabel")} role="list">
              {point.accepts.map((key) => (
                <Chip key={key} role="listitem">
                  {names.get(key) ?? key}
                </Chip>
              ))}
            </div>
          ) : null}
          {point.surplus.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-body-sm font-medium text-ink">{t("surplusLabel")}</p>
              <div className="flex flex-wrap gap-1" role="list">
                {point.surplus.map((key) => (
                  <Chip key={key} tone="closed" role="listitem">
                    {names.get(key) ?? key}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {point.phone ? (
            <Button variant="ghost" size="compact" className="self-start" asChild>
              <a href={`tel:${point.phone}`} aria-label={t("call", { phone: point.phone })}>
                <Phone aria-hidden />
                {point.phone}
              </a>
            </Button>
          ) : null}
          <Directions point={point} event="collection_point_directions_opened" />
          {canEdit ? (
            <div className="flex justify-end gap-2">
              {/* Removing takes the point off everyone's map: a second tap confirms it. */}
              <Button
                variant="ghost"
                disabled={isPending}
                onClick={() =>
                  confirmingRemove
                    ? run(() => removeCollectionPointAction({ id: point.id, slug }), onChanged)
                    : setConfirmingRemove(true)
                }
              >
                {confirmingRemove ? t("confirmRemove") : t("remove")}
              </Button>
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() =>
                  setEdit({
                    version: point.version,
                    status: point.status,
                    statusNote: point.statusNote ?? "",
                    // A supply deactivated since cannot be toggled off nor saved again.
                    accepts: point.accepts.filter((key) => activeKeys.has(key)),
                    surplus: point.surplus.filter((key) => activeKeys.has(key)),
                  })
                }
              >
                {t("changeStatus")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      {error ? <FormError>{error}</FormError> : null}
    </GlassPanel>
  );
}
