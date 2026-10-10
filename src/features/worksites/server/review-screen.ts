import "server-only";

import { getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { canReviewWorksite } from "./policy";
import { findReportForm } from "./queries";
import { listWorksitesToReview, type ReviewPage } from "./review-queue";

/** The review screen's data: the emergency and, for a coordinator, the first page of the queue. */
export async function getReviewScreen({ slug, locale }: { slug: string; locale: string }): Promise<{
  emergency: { slug: string; name: string };
  page: ReviewPage | null;
} | null> {
  const form = await findReportForm({ slug, locale });
  if (!form) return null;
  const access = await getEmergencyAccess(form.emergency.id);
  if (!access || !canReviewWorksite(access)) return { emergency: form.emergency, page: null };
  const page = await listWorksitesToReview(db, {
    emergencyId: form.emergency.id,
    viewerId: access.userId,
    cursor: null,
  });
  return { emergency: form.emergency, page };
}
