import "server-only";

import { requireAdminView } from "@/features/admin";
import { db } from "@/shared/db/client";

import { listFeedback } from "./feedback";

/** The admin feedback list: platform admins only (ADR 0009), then one page. */
export async function loadFeedbackList(after: string | string[] | undefined) {
  await requireAdminView();
  return listFeedback(db, { after: typeof after === "string" ? after : undefined });
}
