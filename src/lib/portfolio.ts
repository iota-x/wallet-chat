import { PublicKey } from "@solana/web3.js";
import type { Address } from "viem";
import type { BalanceLine, Chain, Mode } from "./types";
import { getConnection } from "./solana/connection";
import { readBalances } from "./agent/balances";
import { readEvmBalances } from "./evm/balances";
import { getUtxos, getBtcUsdPrice } from "./btc/api";
import { CHAINS } from "./chains";

export interface ChainHoldings {
  chain: Chain;
  label: string;
  lines: BalanceLine[];
  totalUsd: number;
}

function sumUsd(lines: BalanceLine[]): number {
  return lines.reduce((s, l) => s + (l.usd ?? 0), 0);
}

export interface ConnectedWallets {
  solana?: string | null;
  ethereum?: string | null;
  bitcoin?: string | null;
}

/** Fetch holdings for every connected wallet at the active network tier. */
export async function fetchPortfolio(
  mode: Mode,
  wallets: ConnectedWallets
): Promise<ChainHoldings[]> {
  const jobs: Promise<ChainHoldings | null>[] = [];

  if (wallets.solana) {
    jobs.push(
      readBalances(getConnection(mode), mode, new PublicKey(wallets.solana))
        .then((lines) => ({ chain: "solana" as const, label: CHAINS.solana.label, lines, totalUsd: sumUsd(lines) }))
        .catch(() => null)
    );
  }
  if (wallets.ethereum) {
    jobs.push(
      readEvmBalances(mode, wallets.ethereum as Address)
        .then((lines) => ({ chain: "ethereum" as const, label: CHAINS.ethereum.label, lines, totalUsd: sumUsd(lines) }))
        .catch(() => null)
    );
  }
  if (wallets.bitcoin) {
    jobs.push(
      (async () => {
        const utxos = await getUtxos(mode, wallets.bitcoin!);
        const sats = utxos.filter((u) => u.status.confirmed).reduce((s, u) => s + u.value, 0);
        const price = mode === "mainnet" ? await getBtcUsdPrice() : null;
        const usd = price != null ? (sats / 1e8) * price : null;
        const lines: BalanceLine[] =
          sats > 0
            ? [{ mint: "BTC", symbol: "BTC", decimals: 8, amount: String(sats), uiAmount: sats / 1e8, usd, isNative: true }]
            : [];
        return { chain: "bitcoin" as const, label: CHAINS.bitcoin.label, lines, totalUsd: usd ?? 0 };
      })().catch(() => null)
    );
  }

  const results = await Promise.all(jobs);
  return results.filter((r): r is ChainHoldings => r !== null);
}
