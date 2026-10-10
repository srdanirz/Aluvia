import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import { redactCapture } from "./redact-capture";

const WORKSITE_URL =
  "https://aluvia.cl/es/emergencies/aluvion-2026/worksites/3f2b8c1e-5d4a-4b6f-9e1a-123456789012";

describe("redactCapture", () => {
  it("replaces ids and drops queries in every URL property", () => {
    const capture: CaptureResult = {
      uuid: "0192e4a0-0000-7000-8000-000000000000",
      event: "$pageview",
      properties: {
        $current_url: `${WORKSITE_URL}?q=vecina@example.cl`,
        $pathname: "/es/emergencies/aluvion-2026/worksites/3f2b8c1e-5d4a-4b6f-9e1a-123456789012",
        $referrer: "$direct",
        $prev_pageview_pathname: "/es/emergencies/aluvion-2026/shifts/42",
        $screen_height: 844,
        $browser: "Mobile Safari",
      },
      $set_once: { $initial_current_url: WORKSITE_URL },
    };

    expect(redactCapture(capture)).toEqual({
      ...capture,
      properties: {
        $current_url: "https://aluvia.cl/es/emergencies/aluvion-2026/worksites/:id",
        $pathname: "/es/emergencies/aluvion-2026/worksites/:id",
        $referrer: "$direct",
        $prev_pageview_pathname: "/es/emergencies/aluvion-2026/shifts/:id",
        $screen_height: 844,
        $browser: "Mobile Safari",
      },
      $set_once: { $initial_current_url: "https://aluvia.cl/es/emergencies/aluvion-2026/worksites/:id" },
    });
  });

  it("redacts nested values and any other string, and drops the page title", () => {
    const capture: CaptureResult = {
      uuid: "0192e4a0-0000-7000-8000-000000000001",
      event: "$pageview",
      properties: {
        $title: "Casa de la familia Inventada",
        $initial_person_info: { r: "$direct", u: `${WORKSITE_URL}?q=x` },
        note: "fono 912345678",
      },
    };
    expect(redactCapture(capture)?.properties).toEqual({
      $initial_person_info: {
        r: "$direct",
        u: "https://aluvia.cl/es/emergencies/aluvion-2026/worksites/:id",
      },
      note: "fono [phone]",
    });
  });

  it("passes a dropped event through", () => {
    expect(redactCapture(null)).toBeNull();
  });
});
