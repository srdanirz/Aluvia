import { cn } from "./cn";
import { MARK_BODY, MARK_DIRT, MARK_HEAD, MARK_VIEW_BOX } from "./logo-mark-paths";

// Delays spread the three clods so they leave the shovel one after another.
const DIRT_DELAYS = ["[animation-delay:0ms]", "[animation-delay:70ms]", "[animation-delay:140ms]"] as const;

/**
 * The brand figure digging (docs/DESIGN.md, Marca). Single ink, switched by theme like `Logo`.
 * Pass `label` when it carries meaning; without it the figure is decorative and hidden from
 * screen readers. Motion is the `dig` and `dirt` tokens and stops under `prefers-reduced-motion`.
 */
export function LogoMark({
  label,
  animated = true,
  className,
}: {
  label?: string;
  animated?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEW_BOX}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("size-16 fill-[#1f1f29] dark:fill-[#fefffc]", className)}
    >
      <g className={cn("origin-[150px_340px]", animated && "animate-dig")} fillRule="evenodd">
        <path d={MARK_BODY} />
        <path className={cn("origin-[255px_90px]", animated && "animate-nod")} d={MARK_HEAD} />
      </g>
      {MARK_DIRT.map((d, index) => (
        <path
          key={d}
          d={d}
          className={cn("origin-center", animated && "animate-dirt", animated && DIRT_DELAYS[index])}
        />
      ))}
    </svg>
  );
}
