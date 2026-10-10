"use client";

import { useState } from "react";

import { SegmentedControl } from "@/shared/ui";

type View = "open" | "taken";

export function SegmentedDemo({ label, open, taken }: { label: string; open: string; taken: string }) {
  const [view, setView] = useState<View>("open");
  return (
    <SegmentedControl
      label={label}
      value={view}
      onChange={setView}
      options={[
        { value: "open", label: open },
        { value: "taken", label: taken },
      ]}
      className="max-w-narrow"
    />
  );
}
