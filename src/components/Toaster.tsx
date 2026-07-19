"use client";

import React, { useEffect, useState } from "react";
import { TOAST_EVENT, type ToastDetail, type ToastKind } from "@/lib/toast";

interface Toast extends ToastDetail {
  id: number;
}

const ICON: Record<ToastKind, string> = { success: "✓", error: "✕", info: "›" };
const ACCENT: Record<ToastKind, string> = {
  success: "border-l-pos text-pos",
  error: "border-l-neg text-neg",
  info: "border-l-magenta text-magenta",
};

let seq = 0;

/** The single mounted toast surface. Listens for the global toast event and
 * renders a stack of dismissible, auto-expiring notices. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      const id = ++seq;
      setToasts((prev) => [...prev.slice(-3), { id, ...detail }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div
      className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto w-full sm:w-auto sm:max-w-sm flex items-start gap-2.5 rounded-xl border border-line border-l-2 bg-paper2/95 backdrop-blur px-3.5 py-2.5 shadow-2xl animate-toast-in ${ACCENT[t.kind]}`}
        >
          <span className="font-mono text-[12px] mt-0.5 shrink-0" aria-hidden>
            {ICON[t.kind]}
          </span>
          <span className="text-[13px] leading-snug text-ink flex-1 min-w-0 break-words">
            {t.message}
          </span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 -mr-1 -mt-0.5 h-5 w-5 grid place-items-center rounded text-ink3 hover:text-ink font-mono text-[11px]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
