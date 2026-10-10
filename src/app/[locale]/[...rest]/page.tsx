import { notFound } from "next/navigation";

// Unknown paths under a locale render [locale]/not-found.tsx in that locale, not the global one.
export default function CatchAll() {
  notFound();
}
