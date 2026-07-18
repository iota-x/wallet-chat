import { type Address } from "viem";
import type { Mode, EvmTxRequest, SwapRoute, RouteToken } from "@/lib/types";
import { evmChainId } from "@/lib/chains";
import {
  NATIVE_ETH,
  isNativeEth,
  evmTokenByAddress,
} from "./constants";
import { estimateEvmFees } from "./build";
import type { EvmWatchedToken } from "./simulate";

/**
 * EVM swaps via the KyberSwap aggregator (keyless, mainnet). Same philosophy as
 * the Solana Jupiter path: the aggregator gives us calldata + a router, and we
 * decode the ACTUAL diff from simulation — we never trust the quote's numbers
 * for the balance change. Swaps are a mainnet (read-only) scenario here.
 *
 * Note: for an ERC-20 INPUT the router needs an allowance; without a prior
 * approve the simulation will revert and the plan is (correctly) non-signable.
 * Native-ETH inputs need no approval and simulate cleanly.
 */

const KYBER_BASE = "https://aggregator-api.kyberswap.com/ethereum/api/v1";

interface KyberRouteSummary {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  amountInUsd?: string;
  amountOutUsd?: string;
  route?: { exchange: string }[][];
}

export interface EvmSwapBuild {
  tx: EvmTxRequest;
  route: SwapRoute;
  watched: EvmWatchedToken[];
  targets: string[];
  fetchedAt: number;
}

function resolveRouteToken(addr: string): RouteToken {
  if (isNativeEth(addr)) return { symbol: "ETH", mint: NATIVE_ETH, decimals: 18 };
  const meta = evmTokenByAddress(addr, "mainnet");
  return meta
    ? { symbol: meta.symbol, mint: addr, decimals: meta.decimals }
    : { symbol: `${addr.slice(0, 6)}…`, mint: addr, decimals: 18 };
}

export async function buildEvmSwap(params: {
  mode: Mode;
  owner: Address;
  tokenIn: string;
  tokenOut: string;
  decimalsIn: number;
  decimalsOut: number;
  amountBaseUnits: bigint;
  slippageBps: number;
}): Promise<EvmSwapBuild> {
  const { mode, owner, tokenIn, tokenOut, amountBaseUnits, slippageBps } = params;
  if (mode !== "mainnet") {
    throw new Error("EVM swaps run on Ethereum mainnet (read-only) in this demo.");
  }

  // 1) Route.
  const routeUrl = new URL(`${KYBER_BASE}/routes`);
  routeUrl.searchParams.set("tokenIn", tokenIn);
  routeUrl.searchParams.set("tokenOut", tokenOut);
  routeUrl.searchParams.set("amountIn", amountBaseUnits.toString());
  const routeRes = await fetch(routeUrl.toString(), {
    headers: { "x-client-id": "walletchat" },
    cache: "no-store",
  });
  if (!routeRes.ok) throw new Error(`KyberSwap route failed (${routeRes.status})`);
  const routeJson = (await routeRes.json()) as {
    data?: { routeSummary?: KyberRouteSummary; routerAddress?: string };
  };
  const summary = routeJson.data?.routeSummary;
  const router = routeJson.data?.routerAddress;
  if (!summary || !router) throw new Error("KyberSwap returned no route.");

  // 2) Build calldata.
  const buildRes = await fetch(`${KYBER_BASE}/route/build`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-id": "walletchat" },
    body: JSON.stringify({
      routeSummary: summary,
      sender: owner,
      recipient: owner,
      slippageTolerance: slippageBps,
      source: "walletchat",
    }),
    cache: "no-store",
  });
  if (!buildRes.ok) throw new Error(`KyberSwap build failed (${buildRes.status})`);
  const buildJson = (await buildRes.json()) as {
    data?: { data?: string; routerAddress?: string; amountOut?: string };
  };
  const calldata = buildJson.data?.data;
  if (!calldata) throw new Error("KyberSwap returned no calldata.");

  const amountOut = BigInt(summary.amountOut);
  const minOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const inUsd = summary.amountInUsd ? parseFloat(summary.amountInUsd) : null;
  const outUsd = summary.amountOutUsd ? parseFloat(summary.amountOutUsd) : null;
  const priceImpactPct =
    inUsd && outUsd && inUsd > 0 ? Math.max(0, (1 - outUsd / inUsd) * 100) : 0;

  const steps: RouteToken[] = [
    resolveRouteToken(summary.tokenIn),
    resolveRouteToken(summary.tokenOut),
  ];
  const markets = Array.from(
    new Set((summary.route ?? []).flat().map((h) => h.exchange))
  );

  const route: SwapRoute = {
    steps,
    markets,
    inAmount: summary.amountIn,
    outAmount: summary.amountOut,
    otherAmountThreshold: minOut.toString(),
    slippageBps,
    priceImpactPct,
  };

  const value = isNativeEth(tokenIn) ? amountBaseUnits : 0n;
  const { maxFeePerGas, maxPriorityFeePerGas } = await estimateEvmFees(mode);

  const tx: EvmTxRequest = {
    chainId: evmChainId(mode),
    from: owner,
    to: router,
    data: calldata,
    value: value.toString(),
    gas: "500000", // aggregator swaps are gas-heavy; headroom
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
  };

  const watched: EvmWatchedToken[] = [
    { address: NATIVE_ETH, symbol: "ETH", decimals: 18 },
  ];
  for (const [addr, dec] of [
    [tokenIn, params.decimalsIn],
    [tokenOut, params.decimalsOut],
  ] as const) {
    if (!isNativeEth(addr)) {
      const meta = evmTokenByAddress(addr, "mainnet");
      watched.push({ address: addr, symbol: meta?.symbol ?? "TOKEN", decimals: dec });
    }
  }

  return {
    tx,
    route,
    watched,
    targets: [router.toLowerCase()],
    fetchedAt: Date.now(),
  };
}
