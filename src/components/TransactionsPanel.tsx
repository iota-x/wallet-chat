"use client";

import React, { useEffect, useState } from "react";
import {
  listTransactions,
  clearTransactions,
  updateTxStatus,
  explorerUrl,
  type TxRecord,
} from "@/lib/tx-store";
import { checkTxStatus } from "@/lib/tx-status";
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

export function TransactionsPanel({ onClose }: { onClose: () => void }) {
  const [txns, setTxns] = useState<TxRecord[]>([]);

  useEffect(() => setTxns(listTransactions()), []);

  // Poll pending transactions to confirmation while the panel is open.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const pending = listTransactions().filter((t) => t.status === "pending");
      if (pending.length === 0) return;
      await Promise.all(
        pending.map(async (t) => {
          const s = await checkTxStatus(t.chain, t.mode, t.signature);
          if (s !== "pending") updateTxStatus(t.id, s);
        })
      );
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
                {t.delta && <span className="num text-[11px] text-ink2">{t.delta}</span>}
                <span className="flex-1" />
                <span className="num text-[11px] text-magenta">
                  {shortAddr(t.signature, 6)} ↗
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
