import type { Address } from "viem";
import type { BalanceLine, Mode } from "@/lib/types";
import { EVM_TOKENS, NATIVE_ETH, isNativeEth } from "./constants";
import { readBalancesRaw } from "./rpc";
import { getEvmUsdPrices } from "./pricing";

/**
 * Read the wallet's native ETH plus curated ERC-20 balances for the active
 * network, priced in USD (mainnet). Read-only, no keys.
 */
export async function readEvmBalances(
  mode: Mode,
  owner: Address
): Promise<BalanceLine[]> {
  const tokens = Object.values(EVM_TOKENS).filter(
    (t) => t.addresses[mode] && !isNativeEth(t.addresses[mode]!)
  );
  const tokenAddrs = tokens.map((t) => t.addresses[mode] as Address);

  const balances = await readBalancesRaw(mode, owner, tokenAddrs);
  const lines: BalanceLine[] = [];

  lines.push({
    mint: NATIVE_ETH,
    symbol: "ETH",
    decimals: 18,
    amount: balances.native.toString(),
    uiAmount: Number(balances.native) / 1e18,
    usd: null,
    isNative: true,
  });

  tokens.forEach((t) => {
    const addr = (t.addresses[mode] as string).toLowerCase();
    const amount = balances.tokens[addr] ?? 0n;
    if (amount === 0n) return;
    lines.push({
      mint: t.addresses[mode] as string,
      symbol: t.symbol,
      decimals: t.decimals,
      amount: amount.toString(),
      uiAmount: Number(amount) / 10 ** t.decimals,
      usd: null,
      isNative: false,
    });
  });

  const prices = await getEvmUsdPrices(mode, tokenAddrs);
  for (const line of lines) {
    const p = line.isNative ? prices["native"] : prices[line.mint.toLowerCase()];
    if (p != null) line.usd = line.uiAmount * p;
  }

  lines.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  return lines;
}
