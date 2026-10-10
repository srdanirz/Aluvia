import { cn } from "./cn";

/**
 * For actions in flight (a button that is saving), never for loading a page: pages use Skeleton.
 * `label` is announced to screen readers.
 */
export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      <span
        aria-hidden
        className="size-icon-sm animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
