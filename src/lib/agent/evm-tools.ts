import { tool } from "ai";
import { z } from "zod";
import { getAddress, isAddress, type Address } from "viem";
import type { Mode } from "@/lib/types";
import {
  EVM_TOKENS,
  NATIVE_ETH,
  evmTokenBySymbol,
  isNativeEth,
} from "@/lib/evm/constants";
import { readEvmBalances } from "@/lib/evm/balances";
import { readBalancesRaw } from "@/lib/evm/rpc";
import { buildEvmTransfer } from "@/lib/evm/build";
import { buildEvmSwap } from "@/lib/evm/swap";
import { assembleEvmPlan } from "@/lib/evm/plan";

/** Ethereum tools. owner + mode are bound from the request, never by the model. */
export interface EvmToolContext {
  mode: Mode;
  owner: Address;
}

async function evmBalanceOf(
  mode: Mode,
  owner: Address,
  tokenAddr: string
): Promise<bigint> {
  if (isNativeEth(tokenAddr)) {
    const b = await readBalancesRaw(mode, owner, []);
    return b.native;
  }
  const b = await readBalancesRaw(mode, owner, [tokenAddr as Address]);
  return b.tokens[tokenAddr.toLowerCase()] ?? 0n;
}

function resolveEvmAmount(
  balance: bigint,
  decimals: number,
  isNative: boolean,
  req: { amount?: number; fraction?: number }
): bigint {
  if (req.fraction != null) {
    const f = Math.max(0, Math.min(1, req.fraction));
    let out = (balance * BigInt(Math.round(f * 1_000_000))) / 1_000_000n;
    if (isNative) {
      const buffer = 10n ** 15n; // 0.001 ETH gas buffer
      out = out > buffer ? out - buffer : out;
    }
    return out;
  }
  if (req.amount != null) return BigInt(Math.round(req.amount * 10 ** decimals));
  throw new Error("Specify an absolute amount or a fraction.");
}

export function createEvmTools(ctx: EvmToolContext) {
  const { mode, owner } = ctx;
  return {
    read_balances: tool({
      description:
        "Read the connected Ethereum wallet's ETH and ERC-20 balances (USD-priced on mainnet). Use first to ground amounts like 'half my USDC'.",
      inputSchema: z.object({}),
      execute: async () => ({
        mode,
        owner,
        balances: await readEvmBalances(mode, owner),
      }),
    }),

    build_transfer_plan: tool({
      description:
        "Build, simulate (eth_simulateV1) and guardrail an ETH or ERC-20 transfer. Returns a typed Plan. Does NOT sign or send.",
      inputSchema: z.object({
        destination: z.string().describe("recipient 0x address"),
        symbol: z.string().describe("ETH, USDC, WETH, DAI, …"),
        amount: z.number().optional(),
        fraction: z.number().optional().describe("0..1 of balance"),
      }),
      execute: async (input) => {
        const meta = evmTokenBySymbol(input.symbol);
        const addr = meta?.addresses[mode];
        if (!meta || !addr)
          return { error: `Token ${input.symbol} is not available on ${mode}.` };
        if (!isAddress(input.destination))
          return { error: `Invalid destination address: ${input.destination}` };
        const bal = await evmBalanceOf(mode, owner, addr);
        const amount = resolveEvmAmount(bal, meta.decimals, isNativeEth(addr), input);
        if (amount <= 0n) return { error: "Resolved amount is zero." };
        if (amount > bal) return { error: "Amount exceeds balance." };

        const built = await buildEvmTransfer({
          mode,
          owner,
          to: getAddress(input.destination),
          tokenAddress: addr,
          decimals: meta.decimals,
          symbol: meta.symbol,
          amountBaseUnits: amount,
        });
        const ui = Number(amount) / 10 ** meta.decimals;
        return assembleEvmPlan({
          mode,
          owner,
          kind: "transfer",
          intentSummary: `Send ${ui} ${meta.symbol} to ${input.destination.slice(0, 6)}…${input.destination.slice(-4)}`,
          tx: built.tx,
          watched: built.watched,
          targets: built.targets,
          route: null,
          quote: null,
        });
      },
    }),

    build_swap_plan: tool({
      description:
        "Build, simulate and guardrail a KyberSwap swap (e.g. ETH → USDC, ETH → WBTC). Mainnet only (read-only preview). Returns a typed Plan.",
      inputSchema: z.object({
        inputSymbol: z.string(),
        outputSymbol: z.string(),
        amount: z.number().optional(),
        fraction: z.number().optional(),
        slippageBps: z.number().optional().default(50),
      }),
      execute: async (input) => {
        if (mode !== "mainnet")
          return { error: "EVM swaps run on Ethereum mainnet (read-only). Switch to mainnet." };
        const inMeta = evmTokenBySymbol(input.inputSymbol);
        const outMeta = evmTokenBySymbol(input.outputSymbol);
        const inAddr = inMeta?.addresses.mainnet;
        const outAddr = outMeta?.addresses.mainnet;
        if (!inMeta || !outMeta || !inAddr || !outAddr)
          return { error: `Unknown token: ${input.inputSymbol} or ${input.outputSymbol}` };
        const bal = await evmBalanceOf(mode, owner, inAddr);
        const amount = resolveEvmAmount(bal, inMeta.decimals, isNativeEth(inAddr), input);
        if (amount <= 0n)
          return { error: "Resolved amount is zero — insufficient balance for input." };
        try {
          const built = await buildEvmSwap({
            mode,
            owner,
            tokenIn: inAddr,
            tokenOut: outAddr,
            decimalsIn: inMeta.decimals,
            decimalsOut: outMeta.decimals,
            amountBaseUnits: amount,
            slippageBps: input.slippageBps ?? 50,
          });
          const inUi = Number(amount) / 10 ** inMeta.decimals;
          const minOutUi = Number(built.route.otherAmountThreshold) / 10 ** outMeta.decimals;
          return assembleEvmPlan({
            mode,
            owner,
            kind: "swap",
            intentSummary: `Swap ${inUi} ${inMeta.symbol} → ${outMeta.symbol} (min ${minOutUi.toFixed(4)} out)`,
            tx: built.tx,
            watched: built.watched,
            targets: built.targets,
            route: built.route,
            quote: { fetchedAt: built.fetchedAt, ttlMs: 20_000 },
          });
        } catch (e) {
          return { error: `Swap build failed: ${(e as Error).message}` };
        }
      },
    }),
  };
}
