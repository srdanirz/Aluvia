import { getLocale } from "next-intl/server";

import { requireAdminView } from "@/features/admin";
import { redirect } from "@/shared/i18n/navigation";

export default async function AdminPage() {
  await requireAdminView();
  redirect({ href: "/admin/emergencies", locale: await getLocale() });
}
