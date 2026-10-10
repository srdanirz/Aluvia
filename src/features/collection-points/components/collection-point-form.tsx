"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAction } from "@/shared/lib/use-action";
import { Button, Field, FormError, GlassPanel, Input } from "@/shared/ui";

import { createCollectionPointAction } from "../server/actions";
import type { SupplyOption } from "../server/collection-points";
import { SupplyToggles } from "./supply-toggles";

/**
 * The short form for a new point, once its place is tapped on the map. `id` is fixed for the whole
 * form, so a save retried after a lost answer cannot create the point twice.
 */
export function CollectionPointForm({
  id,
  slug,
  position,
  supplyTypes,
  onCancel,
  onSaved,
}: {
  id: string;
  slug: string;
  position: { lng: number; lat: number } | null;
  supplyTypes: SupplyOption[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("collectionPoints");
  const { run, isPending, error } = useAction();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [phone, setPhone] = useState("");
  const [accepts, setAccepts] = useState<string[]>([]);

  function save() {
    if (!position) return;
    run(
      () =>
        createCollectionPointAction({
          id,
          slug,
          name,
          ...position,
          address: address || null,
          openingHours: openingHours || null,
          phone: phone || null,
          accepts,
        }),
      onSaved,
    );
  }

  return (
    <GlassPanel className="flex max-h-sheet flex-col gap-3 overflow-y-auto p-4">
      <p className="text-body-sm text-ink">{position ? t("placedHint") : t("placeHint")}</p>
      {position ? (
        <>
          <Field id="collection-point-name" label={t("nameLabel")}>
            <Input value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field id="collection-point-hours" label={t("hoursLabel")}>
            <Input
              value={openingHours}
              maxLength={120}
              onChange={(event) => setOpeningHours(event.target.value)}
            />
          </Field>
          <SupplyToggles supplyTypes={supplyTypes} value={accepts} onChange={setAccepts} />
          <Field id="collection-point-address" label={t("addressLabel")}>
            <Input value={address} maxLength={200} onChange={(event) => setAddress(event.target.value)} />
          </Field>
          <Field id="collection-point-phone" label={t("phoneLabel")}>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              maxLength={30}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={isPending} onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button variant="primary" disabled={!position || !name.trim() || isPending} onClick={save}>
          {t("save")}
        </Button>
      </div>
      {error ? <FormError>{error}</FormError> : null}
    </GlassPanel>
  );
}
