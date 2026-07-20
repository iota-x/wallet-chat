"use client";

import React from "react";
import { useWalletChat } from "./WalletProviders";
import { formatUsd } from "@/lib/format";
import { useModalDismiss } from "./useModalDismiss";
import { usePortfolio } from "./usePortfolio";
import { PortfolioBody } from "./PortfolioView";

/** Modal portfolio view — used on narrow screens and from the command palette,
 * where the persistent rail isn't shown. Shares one fetch path with the rail. */
export function PortfolioPanel({ onClose }: { onClose: () => void }) {
  useModalDismiss(onClose);
  const { mode } = useWalletChat();
  const state = usePortfolio();
  const { anyConnected, loading, total } = state;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[82vh] flex flex-col rounded-2xl border border-line bg-paper2 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/70">
          <div>
            <span className="eyebrow">portfolio · {mode === "mainnet" ? "mainnet" : "testnet"}</span>
            <div className="num text-lg text-ink font-medium mt-0.5">
              {loading ? "…" : formatUsd(total)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 grid place-items-center rounded-lg border border-line text-ink2 hover:border-magenta"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {!anyConnected ? (
            <p className="py-8 text-center text-[13px] text-ink3">
              Connect a wallet to see your holdings.
            </p>
          ) : (
            <PortfolioBody state={state} />
          )}
        </div>
      </div>
    </div>
  );
}
