"use server";

import { refresh } from "next/cache";

import { trackServerEvent } from "@/shared/analytics/server";
import { requireUser } from "@/shared/auth/require-user";
import { db } from "@/shared/db/client";
import { toActionLocale } from "@/shared/i18n/action-locale";

import { type OrganizationActionState, organizationInputSchema } from "../schemas";
import { createOrganization } from "./organizations";

/** Creates an organization; the operation re-checks the admin role inside its own statement. */
export async function createOrganizationAction(
  context: { emergencyId: string; locale: string },
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const user = await requireUser("/", toActionLocale(context.locale));
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values = { name: text("name"), publicContact: text("publicContact") };
  const input = organizationInputSchema.safeParse({ emergencyId: context.emergencyId, ...values });
  if (!input.success) return { ok: false, code: "invalid_input", values };
  const result = await createOrganization(db, user.id, input.data);
  if (!result.ok) return { ...result, values };
  trackServerEvent("organization_created", { emergencyId: input.data.emergencyId }, { distinctId: user.id });
  refresh();
  return { ok: true };
}
