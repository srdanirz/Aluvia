import type { LOCALES } from "@/shared/i18n/locales";

import type messages from "../messages/es.json";

// Typed translations: a wrong key or locale fails the typecheck, not the page.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof LOCALES)[number];
    Messages: typeof messages;
  }
}
