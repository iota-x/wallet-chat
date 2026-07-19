import type { AssetDelta } from "@/lib/types";

/**
 * VELOCITY — a cumulative limit across transactions, not just per-transaction.
 *
 * The guardrails cap any single plan, but a compromised session could still
 * drain a wallet with ten "small" sends that each pass. A rolling window ceiling
 * bounds total outflow over time. Transaction history is client-side state, so
 * this is a client-side pre-sign gate; the functions are pure for testing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OutflowRecord {
  ts: number;
  outflowUsd?: number;
  status?: string;
}

/** Sum of USD outflow over the trailing window, excluding failed transactions. */
export function rollingOutflowUsd(
  txs: OutflowRecord[],
  now: number,
  windowMs: number = DAY_MS
): number {
  return txs.reduce((sum, t) => {
    if (t.status === "failed") return sum;
    if (now - t.ts > windowMs) return sum;
    return sum + (t.outflowUsd ?? 0);
  }, 0);
}

/**
 * A plan's NET USD value leaving the wallet = priced debits minus priced credits,
 * floored at 0. Netting matters for velocity: a $1k ETH→USDC swap returns ~$1k of
 * value, so it should barely count, whereas a $1k transfer (no credit) counts in
 * full. A swap into a worthless token prices its credit near 0, so it still counts
 * as a real outflow — exactly what a velocity ceiling should catch.
 */
export function planOutflowUsd(diff: Pick<AssetDelta, "delta" | "usd">[]): number {
  let debit = 0;
  let credit = 0;
  for (const d of diff) {
    if (d.usd == null) continue;
    const v = BigInt(d.delta);
    if (v < 0n) debit += Math.abs(d.usd);
    else if (v > 0n) credit += Math.abs(d.usd);
  }
  return Math.max(0, debit - credit);
}
