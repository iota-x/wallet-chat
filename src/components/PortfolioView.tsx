"use client";

import React from "react";
import { formatUi, formatUsd } from "@/lib/format";
import type { PortfolioState } from "./usePortfolio";

export const ALLOC_COLORS = ["#D51EA6", "#B4A4E4", "#8E97E8", "#E6A15C", "#149A63", "#8B8794"];

/** SVG allocation donut — segments drawn as dash-offset arcs over a faint track. */
export function DonutRing({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 15.5;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 40 40" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={R} fill="none" className="stroke-line" strokeWidth="6" />
      {segments.map((s, i) => {
        const f = s.value / total;
        const dash = f * C;
        const off = -acc * C;
        acc += f;
        return (
          <circle
            key={i}
            cx="20"
            cy="20"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="6"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={off}
          />
        );
      })}
    </svg>
  );
}

/** The connected-wallet holdings view: allocation ring + per-chain balance rows.
 * Rendered inside both the portfolio modal and the persistent rail. */
export function PortfolioBody({ state }: { state: PortfolioState }) {
  const { loading, holdings, total, alloc, anyConnected } = state;

  if (anyConnected && loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 rounded-lg skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {alloc.length > 0 && (
        <div className="flex items-center gap-5">
          <DonutRing
            segments={alloc.map((l, i) => ({
              value: l.usd ?? 0,
              color: ALLOC_COLORS[i % ALLOC_COLORS.length],
            }))}
          />
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {alloc.map((l, i) => (
              <span key={l.mint + l.symbol} className="inline-flex items-center gap-1.5 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }}
                />
                <span className="font-mono text-[11px] text-ink2 truncate">{l.symbol}</span>
                <span className="num text-[10px] text-ink3 ml-auto">{l.pct.toFixed(0)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {holdings.map((h) => (
        <section key={h.chain}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="eyebrow">{h.label}</span>
            <span className="num text-[11px] text-ink2">{formatUsd(h.totalUsd)}</span>
          </div>
          {h.lines.length === 0 ? (
            <p className="text-[12px] text-ink3">No balances.</p>
          ) : (
            <div className="rounded-xl border border-line/70 divide-y divide-line/70 overflow-hidden">
              {h.lines.map((l) => (
                <div key={l.mint + l.symbol} className="flex items-baseline gap-2 px-3 py-2">
                  <span className="font-mono text-[13px] text-ink">{l.symbol}</span>
                  {l.isNative && (
                    <span className="font-mono text-[9px] uppercase tracking-label text-ink3">native</span>
                  )}
                  <span className="flex-1 self-center border-b border-dotted border-line/70" />
                  <span className="num text-[13px] text-ink">{formatUi(l.uiAmount)}</span>
                  <span className="num text-[10px] text-ink3 w-16 text-right">
                    {l.usd != null ? formatUsd(l.usd) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
