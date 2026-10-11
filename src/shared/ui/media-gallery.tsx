import type { ReactNode } from "react";

import { cn } from "./cn";

export type MediaGalleryItem = {
  id: string;
  kind: "image" | "video";
  /** An image or video URL; a local object URL for a file not sent yet. */
  src: string;
  /** Spoken name of an image; a video carries its own controls. */
  alt: string;
  /** Something laid over the tile's corner, such as a Chip ("Oculta"). */
  badge?: ReactNode;
  /** One action under the tile, such as an IconButton (remove, hide). */
  action?: ReactNode;
  /** Shown faded: hidden from the public, still listed for a coordinator. */
  muted?: boolean;
  /** A short line under the tile, such as when it was received. */
  caption?: string;
};

/**
 * Photos and videos of a home as square tiles, two columns on a phone and three from tablet up.
 * Plain `img` and `video`: the sources are short-lived signed URLs (or local files) that an image
 * optimizer would cache past their life. Videos load only their metadata until played.
 */
export function MediaGallery({ items, className }: { items: MediaGalleryItem[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", className)}>
      {items.map((item) => (
        <li key={item.id} className="flex flex-col items-start gap-2">
          <div
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-card bg-surface-muted",
              item.muted && "opacity-40",
            )}
          >
            {item.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URLs must not be cached by the optimizer
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <video
                src={item.src}
                controls
                preload="metadata"
                playsInline
                className="size-full object-cover"
              />
            )}
            {item.badge ? <div className="absolute start-2 top-2">{item.badge}</div> : null}
          </div>
          {item.caption ? <p className="text-caption text-ink-muted">{item.caption}</p> : null}
          {item.action}
        </li>
      ))}
    </ul>
  );
}
