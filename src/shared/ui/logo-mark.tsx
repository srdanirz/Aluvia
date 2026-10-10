import { cn } from "./cn";
import { MARK_BODY, MARK_DIRT, MARK_HEAD, MARK_VIEW_BOX } from "./logo-mark-paths";

// Each clod has its own animation token so they leave the shovel one after another.
const DIRT_ANIMATIONS = ["animate-dirt", "animate-dirt-2", "animate-dirt-3"] as const;

/**
 * The brand figure digging (docs/DESIGN.md, Marca). Single ink, switched by theme like `Logo`.
 * Pass `label` when it carries meaning; without it the figure is decorative and hidden from
 * screen readers. Motion is the `dig`, `nod` and `dirt` tokens and stops under `prefers-reduced-motion`.
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
      className={cn("size-16 fill-brand-ink", className)}
    >
      <g className={cn("origin-[150px_340px]", animated && "animate-dig")} fillRule="evenodd">
        <path d={MARK_BODY} />
        <path className={cn("origin-[255px_90px]", animated && "animate-nod")} d={MARK_HEAD} />
      </g>
      {MARK_DIRT.map((d, index) => (
        <path
          key={d}
          d={d}
          className={cn("origin-center [transform-box:fill-box]", animated && DIRT_ANIMATIONS[index])}
        />
      ))}
    </svg>
  );
}
