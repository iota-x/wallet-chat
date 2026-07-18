import { VersionedTransaction } from "@solana/web3.js";
import type { SwapRoute, RouteToken } from "@/lib/types";
import { tokenByMint, NATIVE_SOL } from "@/lib/solana/constants";

/**
 * Jupiter aggregator integration (mainnet). We use the free lite-api endpoint.
 *
 * DECISION (see DECISION_LOG 1.1): JitoSOL is reached as a Jupiter SWAP with
 * JitoSOL as the output mint, NOT a native stake-pool deposit. This keeps a
 * single simulate/decode/guardrail code path for every "acquire asset X" intent
 * — the diff decoder and policy don't special-case staking. The tradeoff: a
 * native deposit can occasionally price better and avoids DEX slippage, but it
 * would fork the whole pipeline for one asset. Jupiter routes through the stake
 * pool anyway when that's optimal.
 */

const JUP_BASE = process.env.JUPITER_BASE || "https://lite-api.jup.ag/swap/v1";

export interface JupiterRoutePlanStep {
  swapInfo: {
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
  };
  percent: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: JupiterRoutePlanStep[];
  [k: string]: unknown;
}

export interface QuoteResult {
  quoteResponse: JupiterQuoteResponse;
  route: SwapRoute;
  fetchedAt: number;
}

function resolveToken(mint: string): RouteToken {
  const meta = tokenByMint(mint, "mainnet");
  if (meta) return { symbol: meta.symbol, mint, decimals: meta.decimals };
  return { symbol: `${mint.slice(0, 4)}…${mint.slice(-4)}`, mint, decimals: 0 };
}

/** Jupiter reports priceImpactPct as a decimal fraction ("0.0021" = 0.21%). */
function impactToPercent(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n * 100 : 0;
}

export async function getJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
}): Promise<QuoteResult> {
  const { inputMint, outputMint, amount, slippageBps } = params;
  const url = new URL(`${JUP_BASE}/quote`);
  url.searchParams.set("inputMint", inputMint === "SOL" ? NATIVE_SOL : inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount.toString());
  url.searchParams.set("slippageBps", String(slippageBps));
  // Restrict to simple, liquid intermediaries — fewer failure modes at execute.
  url.searchParams.set("restrictIntermediateTokens", "true");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Jupiter quote failed (${res.status}): ${await res.text()}`);
  }
  const quote = (await res.json()) as JupiterQuoteResponse;

  const steps: RouteToken[] = [resolveToken(quote.inputMint)];
  for (const step of quote.routePlan) {
    steps.push(resolveToken(step.swapInfo.outputMint));
  }
  const markets = quote.routePlan.map((s) => s.swapInfo.label);

  const route: SwapRoute = {
    steps,
    markets,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    otherAmountThreshold: quote.otherAmountThreshold,
    slippageBps: quote.slippageBps,
    priceImpactPct: impactToPercent(quote.priceImpactPct),
  };

  return { quoteResponse: quote, route, fetchedAt: Date.now() };
}

/**
 * Ask Jupiter to build the swap transaction for `userPublicKey`. Returns an
 * UNSIGNED VersionedTransaction (Jupiter includes address lookup tables and its
 * own compute-budget instructions). We never sign it here.
 */
export async function buildJupiterSwapTx(params: {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  priorityMicroLamports?: number;
}): Promise<{ tx: VersionedTransaction; base64: string }> {
  const body = {
    quoteResponse: params.quoteResponse,
    userPublicKey: params.userPublicKey,
    // wSOL is wrapped/unwrapped automatically — the diff decoder handles the
    // resulting native/wSOL movement correctly.
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: params.priorityMicroLamports
      ? { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: "medium" } }
      : "auto",
  };

  const res = await fetch(`${JUP_BASE}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Jupiter swap build failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { swapTransaction: string };
  const base64 = json.swapTransaction;
  const tx = VersionedTransaction.deserialize(
    Uint8Array.from(Buffer.from(base64, "base64"))
  );
  return { tx, base64 };
}
