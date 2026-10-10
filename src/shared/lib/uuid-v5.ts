import { createHash } from "node:crypto";

/**
 * Name-based UUID (RFC 9562, version 5): the same namespace and name always give the same id.
 * Imports use it so a row from an outside source keeps its id across runs, which makes
 * `ON CONFLICT (id) DO NOTHING` skip what was already imported.
 */
export function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  if (namespaceBytes.length !== 16) throw new Error("namespace must be a UUID");
  const hash = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
