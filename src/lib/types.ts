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

/**
 * The chains WalletChat understands. `mode` is the network TIER: "devnet" means
 * the executable test tier for the active chain (Solana devnet, Ethereum
 * Sepolia, Bitcoin testnet), "mainnet" is real and read-only in this showcase.
 */
export type Chain = "solana" | "ethereum" | "bitcoin";

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

/**
 * A token-approval decoded from EVM calldata. Approvals move no balance, so a
 * pure balance-diff simulation sees NOTHING for them — this is the classic
 * drain blind-spot. We decode the calldata directly so the guardrail can gate
 * the spender and flag unlimited allowances even though the diff is zero.
 */
export interface ApprovalInfo {
  kind:
    | "erc20-approve"
    | "erc20-increaseAllowance"
    | "setApprovalForAll"
    | "permit";
  /** The address being granted spend authority (lowercased). */
  spender: string;
  /** ERC-20 allowance in base units (decimal string), or null for NFT/boolean grants. */
  amount: string | null;
  /** True if the allowance is effectively unlimited (top-bit / uint256 max region). */
  unlimited: boolean;
  /** setApprovalForAll boolean, when applicable. false = a revoke. */
  approved?: boolean;
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

/** Unsigned EVM transaction request the client signs via its browser wallet. */
export interface EvmTxRequest {
  chainId: number;
  from: string;
  to: string;
  /** Calldata, 0x-prefixed hex. "0x" for a plain native transfer. */
  data: string;
  /** Value in wei, decimal string. */
  value: string;
  /** Gas limit, decimal string. */
  gas: string;
  /** EIP-1559 fees, decimal strings (wei). */
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export interface BtcIo {
  address: string;
  valueSat: number;
  /** For outputs: true if this is change back to the sender. */
  isChange?: boolean;
}

/**
 * Bitcoin plan payload. NOTE: Bitcoin is the "lighter" path — UTXO chains have
 * no on-chain simulation or DEX, so there is no exact post-state diff here. We
 * build a real PSBT and preview exactly which UTXOs go in and which outputs
 * come out, with the fee. Honest about what it is; see DECISION_LOG.
 */
export interface BtcPayload {
  psbtBase64: string;
  inputs: BtcIo[];
  outputs: BtcIo[];
  feeSat: number;
  feeRateSatVb: number;
  /** Sender address script type, for the preview. */
  addressType: "p2wpkh" | "p2tr";
  /** Sender's public key (hex) — required to re-build a Taproot PSBT on re-sim.
   * Public info, not a secret. Null for P2WPKH where it isn't needed. */
  senderPublicKey: string | null;
}

export interface Plan {
  id: string;
  createdAt: number;
  mode: Mode;
  /** Which chain this plan targets. Defaults to solana for back-compat. */
  chain: Chain;
  /** Native asset display info for this chain (SOL/ETH/BTC). */
  nativeSymbol: string;
  nativeDecimals: number;
  kind: PlanKind;
  /** One-line human summary of what this does. Rendered, never parsed. */
  intentSummary: string;
  /** The wallet this plan is for. */
  owner: string;
  /** The external destination of a transfer (for recipient screening). Null for
   * swaps (funds return to the owner) and where there is no single recipient. */
  recipient?: string | null;
  /** A token approval decoded from the (EVM) calldata, if this tx grants one. */
  approval?: ApprovalInfo | null;
  /** Solana: unsigned base64 VersionedTransaction. Null on non-Solana plans. */
  transactionBase64: string | null;
  /** Ethereum: unsigned tx request. Null on non-EVM plans. */
  evmTx: EvmTxRequest | null;
  /** Bitcoin: PSBT + in/out preview. Null on non-BTC plans. */
  btc: BtcPayload | null;
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
