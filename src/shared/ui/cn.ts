import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets a later utility win over an earlier one. Only for use inside shared/ui. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
