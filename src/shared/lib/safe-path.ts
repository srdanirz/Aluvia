import { z } from "zod";

/**
 * An in-app path to return to after a step (`/emergencies/x/join`), without locale. Rejects
 * absolute and protocol-relative URLs (`//evil.example`), so a crafted link cannot send someone
 * off-site after they log in.
 */
export const safePathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\s\\]*$/)
  .catch("/");
