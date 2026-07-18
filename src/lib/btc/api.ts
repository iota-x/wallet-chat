import type { Mode } from "@/lib/types";
import { btcApiBase } from "@/lib/chains";

/** mempool.space read APIs — UTXOs and fee estimates. Read-only. */

export interface Utxo {
  txid: string;
  vout: number;
  value: number; // sats
  status: { confirmed: boolean };
}

export async function getUtxos(mode: Mode, address: string): Promise<Utxo[]> {
  const res = await fetch(`${btcApiBase(mode)}/address/${address}/utxo`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`UTXO fetch failed (${res.status})`);
  return (await res.json()) as Utxo[];
}

/** Recommended fee rates in sat/vB. */
export async function getFeeRates(
  mode: Mode
): Promise<{ fastest: number; halfHour: number; hour: number }> {
  try {
    const res = await fetch(`${btcApiBase(mode)}/v1/fees/recommended`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error();
    const j = (await res.json()) as {
      fastestFee: number;
      halfHourFee: number;
      hourFee: number;
    };
    return { fastest: j.fastestFee, halfHour: j.halfHourFee, hour: j.hourFee };
  } catch {
    return { fastest: 5, halfHour: 3, hour: 2 };
  }
}

export async function getBtcUsdPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://coins.llama.fi/prices/current/coingecko:bitcoin",
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { coins?: Record<string, { price?: number }> };
    return j.coins?.["coingecko:bitcoin"]?.price ?? null;
  } catch {
    return null;
  }
}
