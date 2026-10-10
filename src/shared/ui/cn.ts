import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know our token names; otherwise it treats `text-caption` and `text-ink`
// (or `rounded-control` and `rounded-full`) as unrelated and the cascade picks one by luck.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "heading", "heading-sm", "subheading", "body", "body-sm", "caption"],
      radius: ["control", "card", "panel"],
      spacing: [
        "chip-x",
        "chip-y",
        "chip-gap",
        "dot",
        "icon",
        "icon-sm",
        "panel",
        "sheet",
        "nav-bottom",
        "nav-top",
      ],
      container: ["content", "prose", "narrow"],
      blur: ["glass"],
      shadow: ["card", "float"],
      ease: ["standard", "exit", "spring"],
      animate: ["enter", "shimmer", "spin"],
    },
  },
});

/** Joins class names and lets a later utility win over an earlier one. Only for use inside shared/ui. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
