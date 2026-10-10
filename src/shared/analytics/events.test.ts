import { describe, expect, it } from "vitest";

import { isSensitiveKey } from "@/shared/observability/redact";

import { EVENTS } from "./events";

describe("event catalog", () => {
  const entries = Object.entries(EVENTS);

  it.each(entries)("%s is snake_case", (name) => {
    expect(name).toMatch(/^[a-z]+(?:_[a-z]+)+$/);
  });

  it.each(entries)("%s has camelCase, non-personal properties", (_name, schema) => {
    for (const key of Object.keys(schema.shape)) {
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(isSensitiveKey(key), `${key} looks like personal data`).toBe(false);
    }
  });

  it.each(entries)("%s rejects properties outside its schema", (_name, schema) => {
    const result = schema.safeParse({ phone: "+56 9 1234 5678" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
  });
});
