import type { Address } from "viem";
import type {
  Plan,
  PlanKind,
  Mode,
  SwapRoute,
  Freshness,
  AssetDelta,
  EvmTxRequest,
} from "@/lib/types";
import { modeAllowsSigning } from "@/lib/solana/constants";
import {
  evaluateGuardrails,
  type PolicyDiffEntry,
  type PolicyOverride,
} from "@/lib/guardrails/policy";
import { decodeEvmDiff, type EvmWatchedToken } from "./simulate";
import { getEvmUsdPrices } from "./pricing";
import { EVM_TOKENS, NATIVE_ETH, isNativeEth } from "./constants";

/**
 * EVM plan assembly — the same pipeline as Solana's assemblePlan, one place
 * where an EVM Plan is born and `signable` is derived identically:
 *   signable = simulation.success && guardrail.pass && modeAllowsSigning(mode)
 */

let evmPlanCounter = 0;
function evmPlanId(): string {
  evmPlanCounter += 1;
  return `eplan_${Date.now().toString(36)}_${evmPlanCounter}`;
}

/** Known-good EVM interaction targets: curated tokens + known DEX routers.
 * Anything else the tx calls is blocked by the guardrail (fail-safe). */
function evmAllowlist(mode: Mode): string[] {
  const tokens = Object.values(EVM_TOKENS)
    .map((t) => t.addresses[mode])
    .filter((a): a is string => !!a && !isNativeEth(a))
    .map((a) => a.toLowerCase());
  const routers = [
    "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // KyberSwap MetaAggregationRouterV2
  ];
  return [...tokens, ...routers];
}

/** EVM caps are denominated in wei; USD cap is shared. */
const EVM_POLICY_OVERRIDE = {
  maxSolLamports: 5n * 10n ** 18n, // 5 ETH raw-native cap
  largeValueLamports: 5n * 10n ** 17n, // 0.5 ETH → typed confirmation
  nativeSymbol: "ETH",
  nativeDecimals: 18,
};

async function priceEvmDiff(diff: AssetDelta[], mode: Mode): Promise<AssetDelta[]> {
  const addrs = diff.map((d) => d.mint);
  const prices = await getEvmUsdPrices(mode, addrs);
  return diff.map((d) => {
    const p = d.isNative ? prices["native"] : prices[d.mint.toLowerCase()];
    const usd = p == null ? null : (Number(d.delta) / 10 ** d.decimals) * p;
    return { ...d, usd };
  });
}

export interface AssembleEvmParams {
  mode: Mode;
  owner: Address;
  kind: PlanKind;
  intentSummary: string;
  tx: EvmTxRequest;
  watched: EvmWatchedToken[];
  /** Contract targets invoked (for the allowlist). Empty for a plain ETH send. */
  targets: string[];
  route: SwapRoute | null;
  quote: Freshness | null;
  policyOverride?: PolicyOverride;
}

export async function assembleEvmPlan(params: AssembleEvmParams): Promise<Plan> {
  const { mode, owner, kind, intentSummary, tx, watched, targets, route } = params;

  const { simulation, diff: rawDiff, feeWei } = await decodeEvmDiff(
    mode,
    owner,
    tx,
    watched
  );
  const diff = await priceEvmDiff(rawDiff, mode);

  const policyDiff: PolicyDiffEntry[] = diff.map((d) => ({
    symbol: d.symbol,
    decimals: d.decimals,
    delta: d.delta,
    usd: d.usd,
    isNative: d.isNative,
  }));

  const guardrail = evaluateGuardrails({
    mode,
    simulationPassed: simulation.success,
    programIds: targets,
    diff: policyDiff,
    swap: route ? { slippageBps: route.slippageBps, priceImpactPct: route.priceImpactPct } : null,
    quote: params.quote,
    now: Date.now(),
    config: {
      allowedPrograms: evmAllowlist(mode),
      ...EVM_POLICY_OVERRIDE,
      maxSolLamports: Number(EVM_POLICY_OVERRIDE.maxSolLamports),
      largeValueLamports: Number(EVM_POLICY_OVERRIDE.largeValueLamports),
      ...(params.policyOverride ?? {}),
    },
  });

  const signable = simulation.success && guardrail.pass && modeAllowsSigning(mode);
  const warnings: string[] = [...guardrail.warnings];
  if (!modeAllowsSigning(mode)) {
    warnings.push(
      "Ethereum mainnet is read-only in this demo: the plan, simulation and diff are real, but signing is disabled."
    );
  }
  if (!simulation.success) warnings.push("Simulation failed — see logs below.");

  return {
    id: evmPlanId(),
    createdAt: Date.now(),
    mode,
    chain: "ethereum",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    kind,
    intentSummary,
    owner,
    transactionBase64: null,
    evmTx: tx,
    btc: null,
    simulation,
    diff,
    fee: {
      baseLamports: Number(feeWei),
      priorityLamports: 0,
      rentLamports: 0,
      totalLamports: Number(feeWei),
    },
    route,
    quote: params.quote,
    guardrail,
    signable,
    warnings,
  };
}

export async function resimulateEvmPlan(plan: Plan): Promise<Plan> {
  if (plan.chain !== "ethereum" || !plan.evmTx) {
    throw new Error("resimulateEvmPlan only handles Ethereum plans.");
  }
  const watched: EvmWatchedToken[] = plan.diff.map((d) => ({
    address: d.isNative ? NATIVE_ETH : d.mint,
    symbol: d.symbol,
    decimals: d.decimals,
  }));
  // Ensure native is always watched even if the prior diff omitted it.
  if (!watched.some((w) => isNativeEth(w.address))) {
    watched.unshift({ address: NATIVE_ETH, symbol: "ETH", decimals: 18 });
  }
  const targets =
    plan.evmTx.data !== "0x" ? [plan.evmTx.to.toLowerCase()] : [];
  return assembleEvmPlan({
    mode: plan.mode,
    owner: plan.owner as Address,
    kind: plan.kind,
    intentSummary: plan.intentSummary,
    tx: plan.evmTx,
    watched,
    targets: plan.route ? [plan.evmTx.to.toLowerCase()] : targets,
    route: plan.route,
    quote: plan.quote,
  });
}
