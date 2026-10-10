import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, LOCALES } from "@/shared/i18n/locales";

type Messages = { [key: string]: string | Messages };

function keys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  );
}

function load(locale: string): Messages {
  return JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Messages;
}

describe("messages", () => {
  const reference = keys(load(DEFAULT_LOCALE)).sort();

  it.each(LOCALES)("%s has exactly the keys of the default locale", (locale) => {
    expect(keys(load(locale)).sort()).toEqual(reference);
  });

  it.each(LOCALES)("%s has no empty strings", (locale) => {
    const empty = keys(load(locale)).filter((key) => {
      const value = key
        .split(".")
        .reduce<string | Messages>((node, part) => (node as Messages)[part]!, load(locale));
      return typeof value === "string" && value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
