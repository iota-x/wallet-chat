/**
 * GUARDRAILS — the security control that gates signing.
 *
 * This module is deliberately DEPENDENCY-FREE (no web3, no network, no I/O). It
 * takes plain data describing an already-built, already-simulated plan and
 * returns a verdict. That isolation is the point: the policy can be unit-tested
 * exhaustively, reasoned about in one screen, and can never be "accidentally
 * satisfied" by a side effect. The UI does not re-implement any of this; it
 * reads `report.pass` and nothing else decides whether confirm is enabled.
 *
 * ── THREAT MODEL ────────────────────────────────────────────────────────────
 * Assets at risk: the user's SOL and SPL tokens (signing authority).
 * Untrusted inputs, and what each could try:
 *   • LLM tool output — could propose a transfer to an attacker, an unbounded
 *     amount, or an unknown program (e.g. a drainer). Mitigation: allowlist +
 *     spend caps + sim-must-pass are enforced HERE, not in the model.
 *   • Jupiter/DEX quote — could report a fake price or hide ruinous impact to
 *     make a bad trade look fine. Mitigation: slippage ceiling + price-impact
 *     block, AND a raw native-SOL cap that holds even if USD pricing is lied
 *     about or missing (a $0 price can't unlock an unlimited SOL spend).
 *   • RPC response — could return stale state. Mitigation: quote staleness is a
 *     hard block; the agent re-simulates against fresh state before submit.
 *   • User fat-finger on a large transfer. Mitigation: typed confirmation.
 *
 * What a rogue LLM or malicious quote CANNOT cause, by construction:
 *   1. A signable plan whose simulation did not pass (sim-must-pass is a block).
 *   2. A call to a program outside the allowlist.
 *   3. A net outflow above the spend cap — enforced in BOTH USD and raw SOL, so
 *      breaking the price oracle does not break the cap.
 *   4. Signing on a stale quote.
 * None of these can be reached without failing a `block`-severity check, and
 * `pass` is false if ANY block check fails. `signable` (in the Plan) is
 * `sim.success && guardrail.pass && modeAllowsSigning` — there is no other path.
 */

import type {
  ApprovalInfo,
  GuardrailCheck,
  GuardrailReport,
  Mode,
} from "@/lib/types";

/** Program IDs the agent is permitted to touch. Anything else is a hard block. */
export const DEFAULT_ALLOWED_PROGRAMS: string[] = [
  "11111111111111111111111111111111", // System
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token Account
  "ComputeBudget111111111111111111111111111111", // Compute Budget
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter Aggregator v6
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", // Memo
];

export interface PolicyConfig {
  allowedPrograms: string[];
  /** Hard cap on net outflow value in USD (when pricing is available). */
  maxNotionalUsd: number;
  /** Hard cap on net native SOL outflow in lamports — holds even if unpriced. */
  maxSolLamports: number;
  /** Slippage ceiling in basis points for swaps. */
  maxSlippageBps: number;
  /** Price impact that only warns (bps of the trade eaten by the pool). */
  warnPriceImpactPct: number;
  /** Price impact that hard-blocks (almost certainly a bad/thin route). */
  blockPriceImpactPct: number;
  /** Outflow at/above this USD value requires a typed confirmation. */
  largeValueUsd: number;
  /** Native SOL outflow at/above this (lamports) requires typed confirmation
   * when USD pricing is unavailable. */
  largeValueLamports: number;
  /** Maximum quote age before signing is blocked (ms). */
  quoteMaxAgeMs: number;
  /** Native asset display symbol/decimals for the cap & confirmation messages. */
  nativeSymbol: string;
  nativeDecimals: number;
}

export const DEFAULT_POLICY: PolicyConfig = {
  allowedPrograms: DEFAULT_ALLOWED_PROGRAMS,
  maxNotionalUsd: 5_000,
  maxSolLamports: 25 * 1_000_000_000, // 25 SOL
  maxSlippageBps: 100, // 1.00%
  warnPriceImpactPct: 1, // 1%
  blockPriceImpactPct: 5, // 5%
  largeValueUsd: 250,
  largeValueLamports: 2 * 1_000_000_000, // 2 SOL
  quoteMaxAgeMs: 30_000,
  nativeSymbol: "SOL",
  nativeDecimals: 9,
};

/** The subset of the policy a user may tighten/loosen from the settings panel.
 * The structural controls (allowlist, sim-must-pass, raw-native cap) are NOT
 * user-editable — they are the load-bearing safety guarantees. */
export type PolicyOverride = Partial<
  Pick<
    PolicyConfig,
    "maxNotionalUsd" | "maxSlippageBps" | "largeValueUsd" | "quoteMaxAgeMs"
  >
>;

function clamp(n: unknown, lo: number, hi: number): number | undefined {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(lo, Math.min(hi, v));
}

/** Validate an untrusted override from the client into a safe partial config. */
export function sanitizePolicyOverride(o: unknown): PolicyOverride {
  if (!o || typeof o !== "object") return {};
  const src = o as Record<string, unknown>;
  const out: PolicyOverride = {};
  const usd = clamp(src.maxNotionalUsd, 1, 1_000_000_000);
  const slip = clamp(src.maxSlippageBps, 1, 5000);
  const large = clamp(src.largeValueUsd, 0, 1_000_000_000);
  const age = clamp(src.quoteMaxAgeMs, 3000, 600_000);
  if (usd !== undefined) out.maxNotionalUsd = usd;
  if (slip !== undefined) out.maxSlippageBps = slip;
  if (large !== undefined) out.largeValueUsd = large;
  if (age !== undefined) out.quoteMaxAgeMs = age;
  return out;
}

export interface PolicyDiffEntry {
  symbol: string;
  decimals: number;
  /** Signed base-unit change, as a string (u64-safe). Negative = outflow. */
  delta: string;
  /** Signed USD value of the delta, or null if unpriced. */
  usd: number | null;
  isNative: boolean;
}

export interface PolicyInput {
  mode: Mode;
  simulationPassed: boolean;
  /** Every program id invoked by the transaction (static + LUT-resolved). */
  programIds: string[];
  diff: PolicyDiffEntry[];
  /** Present for swaps only. */
  swap: { slippageBps: number; priceImpactPct: number } | null;
  /** A token approval decoded from the calldata, if the tx grants one. */
  approval?: ApprovalInfo | null;
  /** Present when a time-sensitive quote backs the plan. */
  quote: { fetchedAt: number; ttlMs: number } | null;
  /** Injected clock for deterministic tests. */
  now: number;
  config?: Partial<PolicyConfig>;
}

/** Net outflow magnitudes, computed from the decoded diff (not the quote). */
function computeOutflow(diff: PolicyDiffEntry[]): {
  usd: number | null;
  lamports: bigint;
  anyUnpriced: boolean;
} {
  let usd = 0;
  let sawUsd = false;
  let anyUnpriced = false;
  let lamports = 0n;
  for (const d of diff) {
    const delta = BigInt(d.delta);
    if (delta < 0n) {
      if (d.usd != null) {
        usd += Math.abs(d.usd);
        sawUsd = true;
      } else {
        anyUnpriced = true;
      }
      if (d.isNative) lamports += -delta;
    }
  }
  return { usd: sawUsd ? usd : null, lamports, anyUnpriced };
}

function fmtNative(units: bigint, decimals: number): string {
  return (Number(units) / 10 ** decimals).toFixed(4).replace(/\.?0+$/, "");
}

export function evaluateGuardrails(input: PolicyInput): GuardrailReport {
  const cfg: PolicyConfig = { ...DEFAULT_POLICY, ...input.config };
  const checks: GuardrailCheck[] = [];
  const allowed = new Set(cfg.allowedPrograms);
  const outflow = computeOutflow(input.diff);

  // 1) sim-must-pass — the foundational invariant.
  checks.push({
    id: "sim-must-pass",
    label: "Simulation succeeded",
    severity: "block",
    passed: input.simulationPassed,
    detail: input.simulationPassed
      ? "Transaction simulated successfully against live chain state."
      : "Simulation failed — this plan cannot be signed.",
  });

  // 2) program-allowlist — no unknown programs, ever.
  const unknown = input.programIds.filter((p) => !allowed.has(p));
  checks.push({
    id: "program-allowlist",
    label: "Only allowlisted programs",
    severity: "block",
    passed: unknown.length === 0,
    detail:
      unknown.length === 0
        ? `All ${input.programIds.length} program(s) are allowlisted.`
        : `Blocked: unrecognised program(s) ${unknown.join(", ")}.`,
  });

  // 3) spend cap — enforced in USD AND raw SOL (defense against price lies).
  const usdOverCap =
    outflow.usd != null && outflow.usd > cfg.maxNotionalUsd;
  const solOverCap = outflow.lamports > BigInt(cfg.maxSolLamports);
  checks.push({
    id: "spend-cap",
    label: "Within spend cap",
    severity: "block",
    passed: !usdOverCap && !solOverCap,
    detail: usdOverCap
      ? `Blocked: outflow ~$${outflow.usd!.toFixed(2)} exceeds cap $${cfg.maxNotionalUsd}.`
      : solOverCap
        ? `Blocked: outflow ${fmtNative(outflow.lamports, cfg.nativeDecimals)} ${cfg.nativeSymbol} exceeds cap ${fmtNative(
            BigInt(cfg.maxSolLamports),
            cfg.nativeDecimals
          )} ${cfg.nativeSymbol}.`
        : `Outflow within cap ($${cfg.maxNotionalUsd} / ${fmtNative(
            BigInt(cfg.maxSolLamports),
            cfg.nativeDecimals
          )} ${cfg.nativeSymbol}).`,
  });

  // 3b) approval-safety — a diff sees no balance change for an approval, so we
  // gate the SPENDER (not just the token contract) and flag unlimited grants.
  if (input.approval && input.approval.approved !== false) {
    const { spender, unlimited, amount, kind } = input.approval;
    const spenderAllowed = allowed.has(spender.toLowerCase());
    if (!spenderAllowed) {
      checks.push({
        id: "approval-safety",
        label: "Approval spender allowlisted",
        severity: "block",
        passed: false,
        detail: `Blocked: this ${kind} grants spend authority to non-allowlisted spender ${spender}. Approvals move no balance, so simulation cannot catch this.`,
      });
    } else {
      checks.push({
        id: "approval-safety",
        label: "Approval spender allowlisted",
        severity: unlimited ? "warn" : "block",
        passed: !unlimited,
        detail: unlimited
          ? `Warning: unlimited approval to ${spender}. Prefer an exact-amount approval so a later exploit can't drain more than this trade needs.`
          : `Approval to allowlisted ${spender}${amount ? ` for ${amount} base units` : ""}.`,
      });
    }
  }

  // 4) slippage ceiling (swaps only).
  if (input.swap) {
    const overSlip = input.swap.slippageBps > cfg.maxSlippageBps;
    checks.push({
      id: "slippage-ceiling",
      label: "Slippage within ceiling",
      severity: "block",
      passed: !overSlip,
      detail: overSlip
        ? `Blocked: slippage ${(input.swap.slippageBps / 100).toFixed(
            2
          )}% exceeds ceiling ${(cfg.maxSlippageBps / 100).toFixed(2)}%.`
        : `Slippage ${(input.swap.slippageBps / 100).toFixed(2)}% within ceiling.`,
    });

    // 5) price impact — block the ruinous, warn the merely notable.
    const impact = input.swap.priceImpactPct;
    if (impact >= cfg.blockPriceImpactPct) {
      checks.push({
        id: "price-impact",
        label: "Price impact acceptable",
        severity: "block",
        passed: false,
        detail: `Blocked: price impact ${impact.toFixed(
          2
        )}% exceeds ${cfg.blockPriceImpactPct}% — route is too thin.`,
      });
    } else if (impact >= cfg.warnPriceImpactPct) {
      checks.push({
        id: "price-impact",
        label: "Price impact acceptable",
        severity: "warn",
        passed: false,
        detail: `Warning: price impact ${impact.toFixed(2)}% — you lose value to the pool.`,
      });
    } else {
      checks.push({
        id: "price-impact",
        label: "Price impact acceptable",
        severity: "warn",
        passed: true,
        detail: `Price impact ${impact.toFixed(2)}%.`,
      });
    }
  }

  // 6) quote staleness — a stale quote must not be signable (re-sim required).
  if (input.quote) {
    const age = input.now - input.quote.fetchedAt;
    const ttl = Math.min(input.quote.ttlMs, cfg.quoteMaxAgeMs);
    const stale = age > ttl;
    checks.push({
      id: "quote-freshness",
      label: "Quote is fresh",
      severity: "block",
      passed: !stale,
      detail: stale
        ? `Blocked: quote is ${(age / 1000).toFixed(
            1
          )}s old (max ${(ttl / 1000).toFixed(0)}s). Re-simulate before signing.`
        : `Quote is ${(age / 1000).toFixed(1)}s old — fresh.`,
    });
  }

  const blocking = checks
    .filter((c) => c.severity === "block" && !c.passed)
    .map((c) => c.detail);
  const warnings = checks
    .filter((c) => c.severity === "warn" && !c.passed)
    .map((c) => c.detail);

  const pass = blocking.length === 0;

  // Typed confirmation for large value — required even when everything passes.
  let typedConfirmation: string | null = null;
  if (pass) {
    if (outflow.usd != null && outflow.usd >= cfg.largeValueUsd) {
      typedConfirmation = `send $${Math.round(outflow.usd)}`;
    } else if (
      outflow.usd == null &&
      outflow.lamports >= BigInt(cfg.largeValueLamports)
    ) {
      typedConfirmation = `send ${fmtNative(outflow.lamports, cfg.nativeDecimals)} ${cfg.nativeSymbol}`;
    }
  }

  return { pass, checks, blocking, warnings, typedConfirmation };
}
