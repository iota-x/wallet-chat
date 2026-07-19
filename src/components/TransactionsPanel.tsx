"use client";

import React, { useEffect, useState } from "react";
import {
  listTransactions,
  clearTransactions,
  updateTxStatus,
  setReconciliation,
  explorerUrl,
  type TxRecord,
  type ReconcileDelta,
} from "@/lib/tx-store";
import { checkTxStatus } from "@/lib/tx-status";
import { compareDeltas } from "@/lib/reconcile";
import { CHAINS } from "@/lib/chains";
import { shortAddr } from "@/lib/format";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function StatusPill({ status }: { status: TxRecord["status"] }) {
  const map = {
    pending: { c: "text-warn border-warn/40", t: "pending", dot: "bg-warn animate-blink" },
    confirmed: { c: "text-pos border-pos/40", t: "confirmed", dot: "bg-pos" },
    failed: { c: "text-neg border-neg/40", t: "failed", dot: "bg-neg" },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-label rounded border px-1.5 py-0.5 ${map.c}`}
    >
      <span className={`h-1 w-1 rounded-full ${map.dot}`} />
      {map.t}
    </span>
  );
}

/** Fetch actual on-chain movement and diff it against the stored prediction. */
async function reconcile(t: TxRecord, inFlight: Set<string>) {
  inFlight.add(t.id);
  try {
    if (t.chain === "bitcoin") {
      setReconciliation(t.id, {
        status: "unavailable",
        note: "Bitcoin has no post-state to diff — the broadcast matches the PSBT preview by construction.",
        at: Date.now(),
      });
      return;
    }
    const res = await fetch("/api/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain: t.chain, mode: t.mode, signature: t.signature, owner: t.owner }),
    });
    const data = (await res.json()) as { actual?: ReconcileDelta[] | null };
    if (!res.ok || !data.actual) return; // not indexed yet — retry next tick
    const cmp = compareDeltas(t.predicted ?? [], data.actual);
    const note =
      cmp.status === "matched"
        ? "Reality matched the simulated diff to within tolerance."
        : "Drift — " + cmp.lines.filter((l) => l.startsWith("✕")).join(" · ");
    setReconciliation(t.id, { status: cmp.status, note, at: Date.now() });
  } catch {
    /* transient — retry next tick */
  } finally {
    inFlight.delete(t.id);
  }
}

function ReconcileBadge({ r }: { r: NonNullable<TxRecord["reconciliation"]> }) {
  const map = {
    matched: { c: "text-pos border-pos/40", t: "✓ verified", },
    drift: { c: "text-warn border-warn/40", t: "▲ drifted" },
    unavailable: { c: "text-ink3 border-line", t: "— n/a" },
  }[r.status];
  return (
    <span
      title={r.note}
      className={`inline-flex items-center font-mono text-[9px] uppercase tracking-label rounded border px-1.5 py-0.5 ${map.c}`}
    >
      {map.t}
    </span>
  );
}

export function TransactionsPanel({ onClose }: { onClose: () => void }) {
  const [txns, setTxns] = useState<TxRecord[]>([]);

  useEffect(() => setTxns(listTransactions()), []);

  // Poll pending transactions to confirmation and reconcile confirmed ones.
  useEffect(() => {
    let cancelled = false;
    const reconciling = new Set<string>();

    async function tick() {
      // 1) Advance pending → confirmed/failed.
      const pending = listTransactions().filter((t) => t.status === "pending");
      if (pending.length > 0) {
        await Promise.all(
          pending.map(async (t) => {
            const s = await checkTxStatus(t.chain, t.mode, t.signature);
            if (s !== "pending") updateTxStatus(t.id, s);
          })
        );
      }
      // 2) Reconcile confirmed txns that carry a prediction but no verdict yet.
      const toReconcile = listTransactions().filter(
        (t) => t.status === "confirmed" && t.predicted && !t.reconciliation && !reconciling.has(t.id)
      );
      await Promise.all(toReconcile.map((t) => reconcile(t, reconciling)));
      if (!cancelled) setTxns(listTransactions());
    }

    tick();
    const iv = setInterval(tick, 6000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-line bg-paper2 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/70">
          <div>
            <span className="eyebrow">signed transactions</span>
            <div className="text-[13px] text-ink font-medium mt-0.5">
              {txns.length} on record
            </div>
          </div>
          <div className="flex items-center gap-2">
            {txns.length > 0 && (
              <button
                onClick={() => {
                  clearTransactions();
                  setTxns([]);
                }}
                className="font-mono text-[11px] text-ink3 hover:text-neg transition-colors"
              >
                clear
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-7 w-7 grid place-items-center rounded-lg border border-line text-ink2 hover:border-magenta"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-2">
          {txns.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-ink3">
              No signed transactions yet. When you confirm one on a test network,
              its signature shows up here.
            </p>
          )}
          {txns.map((t) => (
            <a
              key={t.id}
              href={explorerUrl(t.chain, t.mode, t.signature)}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl px-3 py-2.5 hover:bg-haze transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[8px] uppercase tracking-label rounded px-1 py-0.5 border border-magenta/40 text-magenta">
                  {CHAINS[t.chain].nativeSymbol}
                </span>
                <span className="text-[13px] text-ink flex-1 min-w-0 truncate">
                  {t.summary}
                </span>
                <span className="font-mono text-[10px] text-ink3">{timeAgo(t.ts)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 pl-[2px]">
                <StatusPill status={t.status} />
                {t.reconciliation && <ReconcileBadge r={t.reconciliation} />}
                {t.delta && <span className="num text-[11px] text-ink2">{t.delta}</span>}
                <span className="flex-1" />
                <span className="num text-[11px] text-magenta">
                  {shortAddr(t.signature, 6)} ↗
                </span>
              </div>
              {t.reconciliation && t.reconciliation.status === "drift" && (
                <p className="mt-1 pl-[2px] text-[10.5px] text-warn leading-snug">
                  {t.reconciliation.note}
                </p>
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
