"use client";

import React, { useEffect, useState } from "react";

/** Light/dark toggle. The iridescent glass identity holds in both themes. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = (document.documentElement.dataset.theme as "light" | "dark") || "light";
    setTheme(t);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("wc-theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="h-8 w-8 grid place-items-center rounded-full border border-line text-ink2 hover:border-magenta hover:text-ink transition-colors"
    >
      <span className="font-mono text-[13px] leading-none">
        {theme === "dark" ? "☾" : "☀"}
      </span>
    </button>
  );
}
