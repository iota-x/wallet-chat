/**
 * USD pricing. Best-effort and explicitly UNTRUSTED: a wrong or missing price
 * must never widen what the user can spend. The guardrails enforce a raw-SOL cap
 * precisely because this number can be null or lied about. We use it only to
 * make the preview legible, never as a security input.
 */
import { NATIVE_SOL } from "./solana/constants";

const JUP_PRICE_BASE = "https://lite-api.jup.ag/price/v2";

/** mint → USD price. Returns a partial map; callers must handle missing keys. */
export async function getUsdPrices(
  mints: string[]
): Promise<Record<string, number>> {
  const unique = Array.from(new Set(mints.filter(Boolean)));
  if (unique.length === 0) return {};
  // Jupiter prices native SOL under the wSOL mint, which is what we use.
  const ids = unique.map((m) => (m === NATIVE_SOL ? NATIVE_SOL : m)).join(",");
  try {
    const res = await fetch(`${JUP_PRICE_BASE}?ids=${ids}`, {
      // Never cache prices — staleness here is a correctness smell.
      cache: "no-store",
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      data?: Record<string, { price?: string | number } | null>;
    };
    const out: Record<string, number> = {};
    for (const [mint, entry] of Object.entries(json.data ?? {})) {
      const p = entry?.price;
      if (p != null) {
        const num = typeof p === "string" ? parseFloat(p) : p;
        if (Number.isFinite(num) && num >= 0) out[mint] = num;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** USD value of a signed base-unit delta, or null if unpriced. */
export function usdValue(
  deltaBaseUnits: bigint,
  decimals: number,
  price: number | undefined
): number | null {
  if (price == null) return null;
  const ui = Number(deltaBaseUnits) / 10 ** decimals;
  return ui * price;
}
