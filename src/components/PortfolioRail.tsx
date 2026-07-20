"use client";

import React from "react";
import { useWalletChat } from "./WalletProviders";
import { formatUsd } from "@/lib/format";
import { usePortfolio } from "./usePortfolio";
import { PortfolioBody } from "./PortfolioView";
import { TrustCard } from "./TrustCard";

/** A persistent right-hand rail so balances stay on screen beside the chat — the
 * "see all the data at once" surface. Collapses below xl; the modal still covers
 * narrow screens and the command palette. When no wallet is connected it shows the
 * trust card instead, answering the hesitation before it happens. */
export function PortfolioRail() {
  const { mode } = useWalletChat();
  const state = usePortfolio();
  const { anyConnected, loading, total, refresh } = state;

  return (
    <aside className="hidden xl:flex w-80 shrink-0 border-l border-line/70 flex-col bg-paper2/30">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line/70">
        <div>
          <span className="eyebrow">portfolio · {mode === "mainnet" ? "mainnet" : "testnet"}</span>
          <div className="num text-lg text-ink font-medium mt-0.5">
            {!anyConnected ? "—" : loading ? "…" : formatUsd(total)}
          </div>
        </div>
        {anyConnected && (
          <button
            onClick={refresh}
            aria-label="Refresh balances"
            disabled={loading}
            className="h-7 w-7 grid place-items-center rounded-lg border border-line text-ink2 hover:border-magenta hover:text-ink transition-colors disabled:opacity-40"
          >
            <span className={loading ? "animate-spin inline-block" : "inline-block"}>↻</span>
          </button>
        )}
      </div>

      <div className="overflow-y-auto p-4 min-h-0">
        {anyConnected ? <PortfolioBody state={state} /> : <TrustCard />}
      </div>
    </aside>
  );
}
