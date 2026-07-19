import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type {
  Plan,
  PlanKind,
  Mode,
  SwapRoute,
  Freshness,
  AssetDelta,
} from "@/lib/types";
import { NATIVE_SOL, modeAllowsSigning } from "@/lib/solana/constants";
import {
  decodeBalanceDiff,
  type WatchedAsset,
} from "@/lib/solana/simulate";
import { extractProgramIds, computeFeeBreakdown } from "@/lib/solana/inspect";
import {
  evaluateGuardrails,
  type PolicyDiffEntry,
  type PolicyOverride,
} from "@/lib/guardrails/policy";
import { getUsdPrices, usdValue } from "@/lib/pricing";

/**
 * The plan assembly pipeline — the one place a Plan is born. Every path (agent
 * tool AND the pre-submit re-simulation) funnels through `assemblePlan`, so the
 * guardrail evaluation and the `signable` derivation are computed identically
 * everywhere. There is exactly one definition of "signable":
 *
 *     signable = simulation.success && guardrail.pass && modeAllowsSigning(mode)
 *
 * It cannot be set true any other way.
 */

let planCounter = 0;
function planId(): string {
  planCounter += 1;
  return `plan_${Date.now().toString(36)}_${planCounter}`;
}

async function priceDiff(diff: AssetDelta[], mode: Mode): Promise<AssetDelta[]> {
  const mints = diff.map((d) => d.mint);
  const prices = await getUsdPrices(mints);
  return diff.map((d) => {
    const price = prices[d.mint];
    return { ...d, usd: usdValue(BigInt(d.delta), d.decimals, price) };
  });
}

export interface AssembleParams {
  connection: Connection;
  mode: Mode;
  owner: PublicKey;
  kind: PlanKind;
  intentSummary: string;
  tx: VersionedTransaction;
  watchedAssets: WatchedAsset[];
  route: SwapRoute | null;
  quote: Freshness | null;
  policyOverride?: PolicyOverride;
  allowMainnetSign?: boolean;
}

export async function assemblePlan(params: AssembleParams): Promise<Plan> {
  const { connection, mode, owner, kind, intentSummary, tx, watchedAssets } =
    params;

  // 1) Resolve every invoked program (incl. through LUTs) for the allowlist.
  const programIds = await extractProgramIds(connection, tx);

  // 2) Simulate + decode the EXACT diff (the proven path).
  const { simulation, diff: rawDiff } = await decodeBalanceDiff(
    connection,
    owner,
    watchedAssets,
    tx,
    mode
  );

  // 3) Price the diff (best-effort; guardrails don't trust it).
  const diff = await priceDiff(rawDiff, mode);

  // 4) Itemize fees/rent for the preview.
  const fee = await computeFeeBreakdown(connection, tx, diff);

  // 5) Evaluate guardrails — the security control.
  const policyDiff: PolicyDiffEntry[] = diff.map((d) => ({
    symbol: d.symbol,
    decimals: d.decimals,
    delta: d.delta,
    usd: d.usd,
    isNative: d.isNative,
  }));
  const swapForPolicy = params.route
    ? {
        slippageBps: params.route.slippageBps,
        priceImpactPct: params.route.priceImpactPct,
      }
    : null;
  const guardrail = evaluateGuardrails({
    mode,
    simulationPassed: simulation.success,
    programIds,
    diff: policyDiff,
    swap: swapForPolicy,
    quote: params.quote,
    now: Date.now(),
    config: params.policyOverride,
  });

  // 6) The single derivation of signability.
  const canSign = modeAllowsSigning(mode, params.allowMainnetSign);
  const signable = simulation.success && guardrail.pass && canSign;

  const warnings: string[] = [...guardrail.warnings];
  if (mode === "mainnet") {
    warnings.push(
      params.allowMainnetSign
        ? "⚠ Mainnet signing is ON — confirming will broadcast a real transaction and move real funds."
        : "Mainnet is read-only: the plan, simulation and diff are real, but signing is disabled. Turn on mainnet signing in guardrail settings to enable it."
    );
  }
  if (!simulation.success) {
    warnings.push("Simulation failed — inspect the logs below.");
  }

  return {
    id: planId(),
    createdAt: Date.now(),
    mode,
    chain: "solana",
    nativeSymbol: "SOL",
    nativeDecimals: 9,
    kind,
    intentSummary,
    owner: owner.toBase58(),
    transactionBase64: Buffer.from(tx.serialize()).toString("base64"),
    evmTx: null,
    btc: null,
    simulation,
    diff,
    fee,
    route: params.route,
    quote: params.quote,
    guardrail,
    signable,
    warnings,
  };
}

/**
 * Re-simulate an existing plan against fresh chain state right before submit.
 * This is the drift defense: a plan that simulated fine 20 seconds ago may now
 * fail or produce a different diff because the chain moved. We rebuild the plan
 * from its serialized transaction and the assets it already knows about, keeping
 * the ORIGINAL quote timestamp so staleness is judged honestly.
 */
export async function resimulatePlan(
  connection: Connection,
  plan: Plan,
  allowMainnetSign = false
): Promise<Plan> {
  if (plan.chain !== "solana" || !plan.transactionBase64) {
    throw new Error("resimulatePlan only handles Solana plans.");
  }
  const tx = VersionedTransaction.deserialize(
    Uint8Array.from(Buffer.from(plan.transactionBase64, "base64"))
  );
  const watchedAssets: WatchedAsset[] = plan.diff.map((d) => ({
    mint: d.mint,
    symbol: d.symbol,
    decimals: d.decimals,
    native: d.isNative ? true : d.mint === NATIVE_SOL ? false : undefined,
  }));
  return assemblePlan({
    connection,
    mode: plan.mode,
    owner: new PublicKey(plan.owner),
    kind: plan.kind,
    intentSummary: plan.intentSummary,
    tx,
    watchedAssets,
    route: plan.route,
    quote: plan.quote,
    allowMainnetSign,
  });
}
