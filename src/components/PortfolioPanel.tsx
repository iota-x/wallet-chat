"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletChat } from "./WalletProviders";
import { fetchPortfolio, type ChainHoldings } from "@/lib/portfolio";
import { formatUi, formatUsd } from "@/lib/format";

const ALLOC_COLORS = ["#D51EA6", "#B4A4E4", "#8E97E8", "#E6A15C", "#149A63", "#8B8794"];

export function PortfolioPanel({ onClose }: { onClose: () => void }) {
  const { publicKey } = useWallet();
  const { evmAddress, btcAddress, mode } = useWalletChat();
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<ChainHoldings[]>([]);

  const wallets = {
    solana: publicKey?.toBase58() ?? null,
    ethereum: evmAddress,
    bitcoin: btcAddress,
  };
  const anyConnected = !!(wallets.solana || wallets.ethereum || wallets.bitcoin);

  useEffect(() => {
    let cancelled = false;
    if (!anyConnected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPortfolio(mode, wallets)
      .then((h) => !cancelled && setHoldings(h))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wallets.solana, wallets.ethereum, wallets.bitcoin]);

  const total = holdings.reduce((s, h) => s + h.totalUsd, 0);
  const alloc = holdings
    .flatMap((h) => h.lines)
    .filter((l) => (l.usd ?? 0) > 0)
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
    .slice(0, 6);

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

        <div className="overflow-y-auto p-4 space-y-5">
          {!anyConnected && (
            <p className="py-8 text-center text-[13px] text-ink3">
              Connect a wallet to see your holdings.
            </p>
          )}

          {anyConnected && loading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-lg skeleton" />
              ))}
            </div>
          )}

          {anyConnected && !loading && alloc.length > 0 && (
            <div>
              <div className="flex h-2.5 rounded-full overflow-hidden">
                {alloc.map((l, i) => (
                  <div
                    key={l.mint + l.symbol}
                    style={{
                      width: `${((l.usd ?? 0) / (total || 1)) * 100}%`,
                      background: ALLOC_COLORS[i % ALLOC_COLORS.length],
                    }}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                {alloc.map((l, i) => (
                  <span key={l.mint + l.symbol} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }}
                    />
                    <span className="font-mono text-[11px] text-ink2">{l.symbol}</span>
                    <span className="num text-[10px] text-ink3">
                      {(((l.usd ?? 0) / (total || 1)) * 100).toFixed(0)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {anyConnected &&
            !loading &&
            holdings.map((h) => (
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
      </div>
    </div>
  );
}
