import type { ReconcileDelta } from "./tx-store";

/**
 * POST-EXECUTION RECONCILIATION — closing the loop on the whole thesis.
 *
 * The app promises an EXACT simulated diff. After a transaction confirms, this
 * checks whether reality matched: it compares the predicted per-asset movement
 * to what actually happened on-chain. Pure and testable; the fetching of actual
 * state lives server-side (see reconcile-fetch.ts).
 *
 * Native (SOL/ETH) is judged loosely because gas/fees legitimately vary between
 * the estimate and the mined transaction — that is expected drift, not a broken
 * promise. The token legs, which are what the user actually cares about, are
 * judged tightly (with a 1% band to absorb swap slippage).
 */

const TOKEN_TOL_REL = 0.01; // 1% — covers slippage on swaps
const TOKEN_TOL_ABS = 1e-6; // dust floor
const DUST = 1e-9;

export interface ReconcileResult {
  status: "matched" | "drift";
  /** Human lines describing each check (matches and mismatches). */
  lines: string[];
  /** Informational note about native movement (fees vary; not a verdict input). */
  nativeNote: string | null;
}

function byMint(deltas: ReconcileDelta[]): Map<string, ReconcileDelta> {
  const m = new Map<string, ReconcileDelta>();
  for (const d of deltas) m.set(d.mint.toLowerCase(), d);
  return m;
}

export function compareDeltas(
  predicted: ReconcileDelta[],
  actual: ReconcileDelta[]
): ReconcileResult {
  const lines: string[] = [];
  const mismatches: string[] = [];
  const actualMap = byMint(actual);
  const predMap = byMint(predicted);

  // Token legs — the money. Judge every predicted non-native asset.
  for (const p of predicted) {
    if (p.isNative) continue;
    const a = actualMap.get(p.mint.toLowerCase());
    const got = a?.uiDelta ?? 0;
    const tol = Math.max(TOKEN_TOL_ABS, Math.abs(p.uiDelta) * TOKEN_TOL_REL);
    if (Math.abs(got - p.uiDelta) <= tol) {
      lines.push(`✓ ${p.symbol}: predicted ${fmt(p.uiDelta)}, got ${fmt(got)}`);
    } else {
      const line = `✕ ${p.symbol}: predicted ${fmt(p.uiDelta)}, got ${fmt(got)}`;
      lines.push(line);
      mismatches.push(line);
    }
  }

  // Unexpected non-native assets that moved but weren't predicted.
  for (const a of actual) {
    if (a.isNative) continue;
    if (predMap.has(a.mint.toLowerCase())) continue;
    if (Math.abs(a.uiDelta) <= DUST) continue;
    const line = `✕ ${a.symbol}: unexpected movement ${fmt(a.uiDelta)}`;
    lines.push(line);
    mismatches.push(line);
  }

  // Native is informational (fee/gas variance is expected).
  const pn = predicted.find((d) => d.isNative);
  const an = actual.find((d) => d.isNative);
  let nativeNote: string | null = null;
  if (pn || an) {
    nativeNote = `${(pn ?? an)!.symbol}: predicted ${fmt(pn?.uiDelta ?? 0)}, got ${fmt(
      an?.uiDelta ?? 0
    )} (includes network fee)`;
  }

  return {
    status: mismatches.length === 0 ? "matched" : "drift",
    lines,
    nativeNote,
  };
}

function fmt(n: number): string {
  const s = n > 0 ? "+" : "";
  return s + n.toFixed(Math.abs(n) >= 1 ? 4 : 6).replace(/\.?0+$/, "");
}
