"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletChat } from "./WalletProviders";
import { fetchPortfolio, type ChainHoldings } from "@/lib/portfolio";
import type { BalanceLine } from "@/lib/types";

export type AllocLine = BalanceLine & { pct: number };

export interface PortfolioState {
  loading: boolean;
  holdings: ChainHoldings[];
  total: number;
  alloc: AllocLine[];
  anyConnected: boolean;
  refresh: () => void;
}

/** Fetches holdings for every connected wallet at the active tier. Shared by the
 * portfolio modal and the persistent rail so both stay in sync off one fetch path. */
export function usePortfolio(): PortfolioState {
  const { publicKey } = useWallet();
  const { evmAddress, btcAddress, mode } = useWalletChat();
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<ChainHoldings[]>([]);
  const [nonce, setNonce] = useState(0);

  const solana = publicKey?.toBase58() ?? null;
  const anyConnected = !!(solana || evmAddress || btcAddress);

  useEffect(() => {
    let cancelled = false;
    if (!anyConnected) {
      setHoldings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPortfolio(mode, { solana, ethereum: evmAddress, bitcoin: btcAddress })
      .then((h) => !cancelled && setHoldings(h))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, solana, evmAddress, btcAddress, nonce]);

  const total = holdings.reduce((s, h) => s + h.totalUsd, 0);
  const alloc: AllocLine[] = holdings
    .flatMap((h) => h.lines)
    .filter((l) => (l.usd ?? 0) > 0)
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
    .slice(0, 6)
    .map((l) => ({ ...l, pct: ((l.usd ?? 0) / (total || 1)) * 100 }));

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { loading, holdings, total, alloc, anyConnected, refresh };
}
