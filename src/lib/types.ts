/**
 * The typed contract that crosses the server→client wire.
 *
 * The agent never returns prose the UI has to parse. It returns a `Plan`: a
 * fully-typed, self-describing object containing the unsigned transaction, the
 * simulation result, the exact decoded balance diff, the guardrail verdict, and
 * everything the preview needs to render. The client renders this and — only if
 * `signable` is true — offers a confirm affordance that signs locally.
 *
 * `signable` is a DERIVED field, computed server-side as:
 *     simulation.success && guardrail.pass && mode.allowsSigning
 * The client re-derives and re-checks it too (defense in depth), but a Plan can
 * never arrive at the client already marked signable unless simulation passed.
 */

export type Mode = "devnet" | "mainnet";

export type PlanKind = "transfer" | "swap" | "wrap" | "unwrap" | "stake" | "unknown";

/** One asset's exact change, decoded from simulated post-state vs live pre-state. */
export interface AssetDelta {
  mint: string;
  symbol: string;
  decimals: number;
  /** Balance in base units (integer) before the tx, as a string (u64-safe). */
  preAmount: string;
  /** Balance in base units after simulated execution, as a string. */
  postAmount: string;
  /** Signed change in base units (post - pre), as a string. */
  delta: string;
  /** Signed change in human units (delta / 10^decimals). For display only. */
  uiDelta: number;
  /** Best-effort USD value of the delta at plan time, or null if unpriced. */
  usd: number | null;
  /** True for native SOL (lamports), false for SPL token accounts. */
  isNative: boolean;
  /** True if this token account did not exist pre-tx and was created (rent paid). */
  ataCreated: boolean;
}

export interface SimulationResult {
  success: boolean;
  /** The raw simulation error (InstructionError, etc.) or null on success. */
  err: unknown | null;
  logs: string[];
  unitsConsumed: number | null;
  /** The compute unit limit the tx requested, if a ComputeBudget ix set one. */
  computeUnitLimit: number | null;
  /** Blockhash the sim ran against (post replaceRecentBlockhash). */
  blockhash: string | null;
}

export interface FeeBreakdown {
  /** Base + signature fee in lamports, from getFeeForMessage. */
  baseLamports: number;
  /** Priority fee in lamports = computeUnitPrice(µLamports) * CU limit / 1e6. */
  priorityLamports: number;
  /** Rent paid this tx to create new token accounts (lamports). */
  rentLamports: number;
  totalLamports: number;
}

export interface RouteToken {
  symbol: string;
  mint: string;
  decimals: number;
}

export interface SwapRoute {
  /** Ordered token pills for the preview: [in, ...hops, out]. */
  steps: RouteToken[];
  /** Named AMMs the route hops through, in order. */
  markets: string[];
  inAmount: string;
  outAmount: string;
  /** Minimum out after slippage — what actually protects the user. */
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: number;
}

/** Freshness envelope so the client can detect a stale quote and force re-sim. */
export interface Freshness {
  fetchedAt: number; // epoch ms
  ttlMs: number;
}

export type GuardrailSeverity = "block" | "warn";

export interface GuardrailCheck {
  id: string;
  label: string;
  severity: GuardrailSeverity;
  passed: boolean;
  detail: string;
}

export interface GuardrailReport {
  /** True only if every `block`-severity check passed. Gates `signable`. */
  pass: boolean;
  checks: GuardrailCheck[];
  /** Convenience: messages for checks that failed or warned. */
  blocking: string[];
  warnings: string[];
  /** If set, the user must type this exact string to enable confirm (large value). */
  typedConfirmation: string | null;
}

export interface Plan {
  id: string;
  createdAt: number;
  mode: Mode;
  kind: PlanKind;
  /** One-line human summary of what this does. Rendered, never parsed. */
  intentSummary: string;
  /** The wallet this plan is for. */
  owner: string;
  /** Unsigned, base64-encoded VersionedTransaction the client will sign. */
  transactionBase64: string;
  simulation: SimulationResult;
  diff: AssetDelta[];
  fee: FeeBreakdown;
  route: SwapRoute | null;
  quote: Freshness | null;
  guardrail: GuardrailReport;
  /** DERIVED gate: sim.success && guardrail.pass && mode allows signing. */
  signable: boolean;
  /** Human-readable notes surfaced above the confirm affordance. */
  warnings: string[];
}

/** A single wallet balance line for the read-only balances view. */
export interface BalanceLine {
  mint: string;
  symbol: string;
  decimals: number;
  amount: string; // base units
  uiAmount: number;
  usd: number | null;
  isNative: boolean;
}
