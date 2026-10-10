import { getTranslations } from "next-intl/server";

import { DisasterTypeForm, requireAdminView, PageHeader } from "@/features/admin";

export default async function NewDisasterTypePage() {
  const [t] = await Promise.all([getTranslations("admin.disasterTypes"), requireAdminView()]);
  return (
    <div className="flex max-w-prose animate-enter flex-col gap-12">
      <PageHeader title={t("newTitle")} />
      <DisasterTypeForm />
    </div>
  );
}
