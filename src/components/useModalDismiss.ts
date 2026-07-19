"use client";

import { useEffect } from "react";

/** Close a modal on Escape. Pair with the backdrop click each panel already has. */
export function useModalDismiss(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
