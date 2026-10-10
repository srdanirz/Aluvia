import createMiddleware from "next-intl/middleware";

import { routing } from "@/shared/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except API routes, notice short links (/n/<id>), Next internals and files with an extension.
  matcher: "/((?!api|n/|_next|_vercel|.*\\..*).*)",
};
