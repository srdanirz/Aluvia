import "server-only";

import { canUpdateWorksite, getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { findUpdateForm, type UpdateForm } from "./queries";

/** The update screen's data and whether the signed-in person may send it; null if the home is not there. */
export async function getUpdateScreen(input: {
  slug: string;
  worksiteId: string;
  locale: string;
}): Promise<{ form: UpdateForm; canUpdate: boolean } | null> {
  const form = await findUpdateForm(input);
  if (!form) return null;
  const access = await getEmergencyAccess(form.emergency.id);
  return { form, canUpdate: await canUpdateWorksite(db, access, input.worksiteId) };
}
