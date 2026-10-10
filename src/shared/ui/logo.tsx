import { cn } from "./cn";

/**
 * The Aluvia wordmark, single ink, never recolored (docs/DESIGN.md, Marca). Both inks ship and
 * the theme shows one, so there is no flash and no JavaScript.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-8", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization to gain */}
      <img src="/brand/aluvia-logo.svg" alt="Aluvia" className="h-full w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization to gain */}
      <img src="/brand/aluvia-logo-inverse.svg" alt="Aluvia" className="hidden h-full w-auto dark:block" />
    </span>
  );
}
