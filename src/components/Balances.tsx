"use client";

import React from "react";
import type { BalanceLine } from "@/lib/types";
import { formatUi, formatUsd } from "@/lib/format";

/** Read-only balances, rendered as a compact account statement. */
export function Balances({
  balances,
  mode,
}: {
  balances: BalanceLine[];
  mode: string;
}) {
  const total = balances.reduce((s, b) => s + (b.usd ?? 0), 0);
  return (
    <div className="animate-print-in w-full">
      <div className="perforation" />
      <div className="ledger-rule rounded-b-2xl border border-line border-t-0 slip-paper overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/60">
          <span className="eyebrow">holdings · {mode}</span>
          <span className="num text-sm text-ink">{formatUsd(total)}</span>
        </div>
        <div className="px-4 py-2">
          {balances.map((b) => (
            <div
              key={b.mint + b.symbol}
              className="flex items-baseline gap-2 py-2"
            >
              <span className="font-mono text-[13px] text-ink">{b.symbol}</span>
              {b.isNative && (
                <span className="font-mono text-[9px] uppercase tracking-label text-ink3">
                  native
                </span>
              )}
              <span className="flex-1 self-center border-b border-dotted border-line/70" />
              <span className="text-right">
                <span className="num text-[14px] text-ink">{formatUi(b.uiAmount)}</span>
                <span className="num text-[10px] text-ink3 ml-2">
                  {b.usd != null ? formatUsd(b.usd) : "—"}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
