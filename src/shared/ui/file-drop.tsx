"use client";

import { type ReactNode, useEffect, useState } from "react";

import { cn } from "./cn";

/**
 * A region that takes files dropped on it and files pasted anywhere on the page (a screenshot, a
 * photo copied from another app), on top of whatever picker it wraps. Touch screens never drag, so
 * the picker inside stays the main way in; this is the desktop shortcut. While a file hovers, the
 * region turns to the accent tint (no borders: DESIGN.md).
 */
export function FileDrop({
  onFiles,
  disabled = false,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    if (disabled) return;
    const paste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      onFiles(files);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [disabled, onFiles]);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card transition-colors",
        isOver && "bg-accent-tint",
        className,
      )}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        // Leaving for a child is not leaving the region.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOver(false);
      }}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setIsOver(false);
        const files = [...event.dataTransfer.files];
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
    </div>
  );
}
