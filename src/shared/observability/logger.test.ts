import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureConsole, logInfo } from "./logger";

// The console is what these tests exercise; app code never calls it (no-console).
const output: Console = console;

const METHODS = ["debug", "trace", "dir", "table", "log", "info", "warn", "error"] as const;

describe("logger", () => {
  let lines: string[];
  const original = Object.fromEntries(METHODS.map((method) => [method, output[method]]));

  beforeEach(() => {
    lines = [];
    const capture = (chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(capture);
    vi.spyOn(process.stderr, "write").mockImplementation(capture);
  });

  afterEach(() => {
    Object.assign(output, original);
    vi.restoreAllMocks();
  });

  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

  it("never throws on fields it cannot serialize", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("trap");
        },
      },
    );
    expect(() => logInfo("still_logged", { hostile, big: 10n })).not.toThrow();
    expect(entries()[0]).toMatchObject({ severity: "INFO", message: "still_logged" });
  });

  it("writes BigInt fields as strings", () => {
    logInfo("counted", { total: 10n });
    expect(entries()[0]).toMatchObject({ total: "10" });
  });

  describe("captureConsole", () => {
    beforeEach(() => captureConsole());

    it("turns a Next.js error line into one redacted JSON entry with its stack", () => {
      output.error(" \u001b[31m⨯\u001b[39m", new Error("fallo con +56 9 1234 5678"));
      const [entry] = entries();
      expect(entry).toMatchObject({
        severity: "ERROR",
        message: "Error: fallo con [phone]",
        error: { name: "Error", message: "fallo con [phone]" },
      });
      expect(entry?.stack_trace).toEqual(expect.stringMatching(/^Error: fallo con \[phone\]\n/));
      expect(lines.join("")).not.toContain("1234 5678");
    });

    it("redacts objects by key before formatting them", () => {
      output.log("payload", { contactName: "Vecina Inventada", count: 2 });
      expect(entries()[0]).toMatchObject({ severity: "INFO" });
      expect(entries()[0]?.message).toContain("[redacted]");
      expect(lines.join("")).not.toContain("Vecina Inventada");
    });

    it("fills %s placeholders with the error's message", () => {
      output.warn("failed: %s", new Error("timeout"));
      expect(entries()[0]).toMatchObject({ severity: "WARNING", message: "failed: Error: timeout" });
    });

    it("keeps the line when an argument throws while being read", () => {
      const hostile = new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error("trap");
          },
        },
      );
      expect(() => output.error("x", hostile)).not.toThrow();
      expect(entries()[0]).toMatchObject({ severity: "ERROR", message: "console_output" });
    });

    it.each(["trace", "dir", "table"] as const)("routes console.%s too", (method) => {
      output[method]({ phone: "+56 9 1234 5678" });
      expect(entries()[0]).toMatchObject({ severity: "DEBUG" });
      expect(lines.join("")).not.toContain("1234 5678");
    });
  });
});
