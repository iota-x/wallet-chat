import type { Mode } from "@/lib/types";
import { isNativeEth } from "./constants";

/**
 * EVM USD pricing via DeFiLlama's keyless coins API. Best-effort and untrusted,
 * exactly like the Solana side — the guardrails' raw-native cap is what actually
 * protects the user, so a missing/wrong price can't widen a spend.
 */
const LLAMA = "https://coins.llama.fi/prices/current";

/** Returns { tokenAddressLower | "native": usdPrice }. Mainnet prices only
 * (testnet tokens are unpriced, which the UI shows honestly). */
export async function getEvmUsdPrices(
  mode: Mode,
  addresses: string[]
): Promise<Record<string, number>> {
  if (mode !== "mainnet") return {}; // testnet assets have no meaningful USD price
  const keys: string[] = ["coingecko:ethereum"]; // native ETH
  for (const a of addresses) {
    if (!isNativeEth(a)) keys.push(`ethereum:${a}`);
  }
  try {
    const res = await fetch(`${LLAMA}/${keys.join(",")}`, { cache: "no-store" });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      coins?: Record<string, { price?: number }>;
    };
    const out: Record<string, number> = {};
    for (const [key, v] of Object.entries(json.coins ?? {})) {
      if (v?.price == null) continue;
      if (key === "coingecko:ethereum") out["native"] = v.price;
      else if (key.startsWith("ethereum:")) out[key.slice("ethereum:".length).toLowerCase()] = v.price;
    }
    return out;
  } catch {
    return {};
  }
}
