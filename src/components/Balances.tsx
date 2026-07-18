"use client";

import React from "react";
import type { BalanceLine } from "@/lib/types";
import { formatUi, formatUsd } from "@/lib/format";

/** Compact read-only balances panel, rendered from the read_balances tool. */
export function Balances({
  balances,
  mode,
}: {
  balances: BalanceLine[];
  mode: string;
}) {
  const total = balances.reduce((s, b) => s + (b.usd ?? 0), 0);
  return (
    <div className="animate-fade-up rounded-2xl border border-hairline bg-surface/80 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
        <span className="text-[10px] uppercase tracking-wider text-faint">
          Wallet balances · {mode}
        </span>
        <span className="num text-sm text-ink">{formatUsd(total)}</span>
      </div>
      <ul className="divide-y divide-hairline">
        {balances.map((b) => (
          <li
            key={b.mint + b.symbol}
            className="flex items-center justify-between px-4 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-full grid place-items-center text-[10px] bg-raised text-muted">
                {b.symbol.slice(0, 2)}
              </span>
              <span className="text-sm text-ink">{b.symbol}</span>
              {b.isNative && (
                <span className="text-[10px] text-faint">native</span>
              )}
            </div>
            <div className="text-right">
              <div className="num text-sm text-ink">{formatUi(b.uiAmount)}</div>
              <div className="num text-[11px] text-faint">
                {b.usd != null ? formatUsd(b.usd) : "unpriced"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
