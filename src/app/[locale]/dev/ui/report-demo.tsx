"use client";

import { useState } from "react";

import { Field, Stepper, Textarea, ToggleTile } from "@/shared/ui";

type ReportDemoProps = {
  tiles: string[];
  stepperLabel: string;
  decrement: string;
  increment: string;
  notesLabel: string;
};

export function ReportDemo({ tiles, stepperLabel, decrement, increment, notesLabel }: ReportDemoProps) {
  const [pressed, setPressed] = useState<string[]>(tiles.slice(0, 1));
  const [count, setCount] = useState(3);
  return (
    <div className="grid max-w-narrow gap-6">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <ToggleTile
            key={tile}
            pressed={pressed.includes(tile)}
            onPressedChange={(on) =>
              setPressed((list) => (on ? [...list, tile] : list.filter((t) => t !== tile)))
            }
          >
            {tile}
          </ToggleTile>
        ))}
      </div>
      <Stepper
        label={stepperLabel}
        value={count}
        onChange={setCount}
        decrementLabel={decrement}
        incrementLabel={increment}
      />
      <Field id="demo-notes" label={notesLabel}>
        <Textarea rows={3} />
      </Field>
    </div>
  );
}
