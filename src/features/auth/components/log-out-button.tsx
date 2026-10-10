import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/shared/ui";

import { logOut } from "../server/actions";

export async function LogOutButton() {
  const t = await getTranslations("auth");
  return (
    <form action={logOut}>
      <Button type="submit" variant="ghost">
        <LogOut aria-hidden />
        {t("logOut")}
      </Button>
    </form>
  );
}
