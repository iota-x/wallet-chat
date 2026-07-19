"use client";

import { useEffect } from "react";
import { listTransactions, updateTxStatus } from "@/lib/tx-store";
import { checkTxStatus } from "@/lib/tx-status";
import { runReconcile } from "@/lib/reconcile-run";
import { notify } from "@/lib/toast";

/**
 * Always-on transaction watcher, mounted once at the app root. Advances pending
 * transactions to confirmed/failed and toasts the transition, then reconciles
 * confirmed ones — so a tx you signed keeps being tracked even with every panel
 * closed. Polls only while there's outstanding work.
 */
export function useTxWatcher() {
  useEffect(() => {
    const reconciling = new Set<string>();

    async function tick() {
      const all = listTransactions();
      const pending = all.filter((t) => t.status === "pending");
      for (const t of pending) {
        const s = await checkTxStatus(t.chain, t.mode, t.signature);
        if (s !== "pending") {
          updateTxStatus(t.id, s);
          notify(
            s === "confirmed" ? `Confirmed · ${t.summary}` : `Failed · ${t.summary}`,
            s === "confirmed" ? "success" : "error"
          );
        }
      }
      const toReconcile = listTransactions().filter(
        (t) => t.status === "confirmed" && t.predicted && !t.reconciliation && !reconciling.has(t.id)
      );
      await Promise.all(toReconcile.map((t) => runReconcile(t, reconciling)));
    }

    tick();
    const iv = setInterval(tick, 7000);
    return () => clearInterval(iv);
  }, []);
}
