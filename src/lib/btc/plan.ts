import type {
  Plan,
  Mode,
  AssetDelta,
  GuardrailReport,
  GuardrailCheck,
} from "@/lib/types";
import { modeAllowsSigning } from "@/lib/solana/constants";
import type { PolicyOverride } from "@/lib/guardrails/policy";
import { blocklistCheck } from "@/lib/security/blocklist";
import { buildBtcTransfer } from "./build";
import { getBtcUsdPrice } from "./api";

/**
 * Bitcoin plan assembly. Because there is no on-chain simulation on a UTXO
 * chain, the guardrails here are CONSTRUCTION-based, and we say so honestly: the
 * PSBT is well-formed and funded, the fee is sane, no dust is created, and the
 * spend cap holds. The invariant "guardrails gate the confirm affordance" still
 * holds — `signable` is still `constructed && guardrail.pass && modeAllowsSigning`.
 */

const SATS = 100_000_000;
const RAW_BTC_CAP_SAT = 0.25 * SATS;
const LARGE_VALUE_SAT = 0.05 * SATS;

let btcPlanCounter = 0;
function btcPlanId(): string {
  btcPlanCounter += 1;
  return `bplan_${Date.now().toString(36)}_${btcPlanCounter}`;
}

function evaluateBtcGuardrails(
  sendSat: number,
  feeSat: number,
  usd: number | null,
  usdCap: number,
  largeUsd: number,
  recipient: string | null
): GuardrailReport {
  const checks: GuardrailCheck[] = [];
  const outSat = sendSat + feeSat;

  checks.push({
    id: "tx-constructed",
    label: "PSBT constructed & funded",
    severity: "block",
    passed: true,
    detail: "Coin selection succeeded; a valid PSBT was built from confirmed UTXOs.",
  });

  const blCheck = blocklistCheck([recipient]);
  if (blCheck) checks.push(blCheck);

  const usdOver = usd != null && usd > usdCap;
  const satOver = outSat > RAW_BTC_CAP_SAT;
  checks.push({
    id: "spend-cap",
    label: "Within spend cap",
    severity: "block",
    passed: !usdOver && !satOver,
    detail:
      usdOver
        ? `Blocked: ~$${usd!.toFixed(2)} exceeds cap $${usdCap}.`
        : satOver
          ? `Blocked: ${(outSat / SATS).toFixed(8)} BTC exceeds cap ${(RAW_BTC_CAP_SAT / SATS)} BTC.`
          : `Outflow within cap ($${usdCap} / ${RAW_BTC_CAP_SAT / SATS} BTC).`,
  });

  const feeRatio = sendSat > 0 ? feeSat / sendSat : 1;
  checks.push({
    id: "fee-sanity",
    label: "Fee is reasonable",
    severity: feeRatio > 0.5 ? "block" : "warn",
    passed: feeRatio <= 0.1,
    detail:
      feeRatio > 0.5
        ? `Blocked: fee ${feeSat} sats is over 50% of the amount sent.`
        : feeRatio > 0.1
          ? `Warning: fee ${feeSat} sats is ${(feeRatio * 100).toFixed(1)}% of the amount.`
          : `Fee ${feeSat} sats (${(feeRatio * 100).toFixed(2)}% of amount).`,
  });

  const blocking = checks.filter((c) => c.severity === "block" && !c.passed).map((c) => c.detail);
  const warnings = checks.filter((c) => c.severity === "warn" && !c.passed).map((c) => c.detail);
  const pass = blocking.length === 0;

  let typedConfirmation: string | null = null;
  if (pass) {
    if (usd != null && usd >= largeUsd) typedConfirmation = `send $${Math.round(usd)}`;
    else if (outSat >= LARGE_VALUE_SAT)
      typedConfirmation = `send ${(outSat / SATS).toFixed(8).replace(/\.?0+$/, "")} BTC`;
  }

  return { pass, checks, blocking, warnings, typedConfirmation };
}

export async function assembleBtcPlan(params: {
  mode: Mode;
  fromAddress: string;
  toAddress: string;
  amountSat: number;
  feeRateSatVb: number;
  intentSummary: string;
  senderPublicKey?: string | null;
  policyOverride?: PolicyOverride;
  allowMainnetSign?: boolean;
}): Promise<Plan> {
  const { mode, fromAddress, toAddress, amountSat, feeRateSatVb, intentSummary } =
    params;

  const built = await buildBtcTransfer({
    mode,
    fromAddress,
    toAddress,
    amountSat,
    feeRateSatVb,
    senderPublicKey: params.senderPublicKey,
  });
  const feeSat = built.payload.feeSat;
  const price = await getBtcUsdPrice();

  // Net outflow from the sender = amount to recipient + fee (change returns).
  const outSat = amountSat + feeSat;
  const usdOut = price != null && mode === "mainnet" ? (outSat / SATS) * price : null;

  const diff: AssetDelta[] = [
    {
      mint: "BTC",
      symbol: "BTC",
      decimals: 8,
      preAmount: built.totalInputSat.toString(),
      postAmount: (built.totalInputSat - outSat).toString(),
      delta: (-outSat).toString(),
      uiDelta: -outSat / SATS,
      usd: usdOut != null ? -Math.abs(usdOut) : null,
      isNative: true,
      ataCreated: false,
    },
  ];

  const guardrail = evaluateBtcGuardrails(
    amountSat,
    feeSat,
    usdOut,
    params.policyOverride?.maxNotionalUsd ?? 5000,
    params.policyOverride?.largeValueUsd ?? 250,
    toAddress
  );
  const signable = guardrail.pass && modeAllowsSigning(mode, params.allowMainnetSign);

  const warnings: string[] = [...guardrail.warnings];
  warnings.push(
    "Bitcoin has no on-chain simulation: this preview is derived from the PSBT (inputs/outputs/fee), not a live execution."
  );
  if (mode === "mainnet") {
    warnings.push(
      params.allowMainnetSign
        ? "⚠ Mainnet signing is ON — confirming will broadcast a real Bitcoin transaction and move real funds."
        : "Bitcoin mainnet is read-only — signing is disabled. Turn on mainnet signing in guardrail settings to enable it."
    );
  }

  return {
    id: btcPlanId(),
    createdAt: Date.now(),
    mode,
    chain: "bitcoin",
    nativeSymbol: "BTC",
    nativeDecimals: 8,
    kind: "transfer",
    intentSummary,
    owner: fromAddress,
    recipient: toAddress,
    approval: null,
    transactionBase64: null,
    evmTx: null,
    btc: built.payload,
    simulation: {
      success: true,
      err: null,
      logs: [`Built PSBT with ${built.payload.inputs.length} input(s).`],
      unitsConsumed: null,
      computeUnitLimit: null,
      blockhash: null,
    },
    diff,
    fee: {
      baseLamports: feeSat,
      priorityLamports: 0,
      rentLamports: 0,
      totalLamports: feeSat,
    },
    route: null,
    quote: null,
    guardrail,
    signable,
    warnings,
  };
}
