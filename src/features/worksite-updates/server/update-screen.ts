import "server-only";

import { findUpdateForm, type UpdateForm } from "./queries";

/** The update screen's data; null if the home is not in an open emergency. Anyone may send it (ADR 0018). */
export async function getUpdateScreen(input: {
  slug: string;
  worksiteId: string;
  locale: string;
}): Promise<UpdateForm | null> {
  return findUpdateForm(input);
}
