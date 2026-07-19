"use client";

import React, { useState } from "react";
import { notify } from "@/lib/toast";

/** One-tap copy with a brief check state + toast. Safe inside clickable rows. */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          notify(label ? `Copied ${label}` : "Copied", "success");
          window.setTimeout(() => setDone(false), 1200);
        });
      }}
      aria-label={label ? `Copy ${label}` : "Copy"}
      className={`shrink-0 font-mono text-[11px] leading-none text-ink3 hover:text-magenta transition-colors ${className ?? ""}`}
    >
      {done ? "✓" : "⧉"}
    </button>
  );
}
