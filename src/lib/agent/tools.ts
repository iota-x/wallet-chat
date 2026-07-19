import { tool } from "ai";
import type { PolicyOverride } from "@/lib/guardrails/policy";
import { z } from "zod";
import { Connection, PublicKey } from "@solana/web3.js";
import type { Mode } from "@/lib/types";
import {
  NATIVE_SOL,
  SOL_DECIMALS,
  LAMPORTS_PER_SOL,
  tokenBySymbol,
  modeAllowsSigning,
} from "@/lib/solana/constants";
import { getAssociatedTokenAddress, readTokenBalance } from "@/lib/solana/tokens";
import { readBalances } from "./balances";
import { buildTransfer } from "@/lib/solana/build";
import { getJupiterQuote, buildJupiterSwapTx } from "@/lib/jupiter";
import { isSolName, resolveSolDomain } from "@/lib/names/resolve";
import { assemblePlan } from "./plan";
import type { WatchedAsset } from "@/lib/solana/simulate";

/**
 * The agent's tools. Every tool is READ / PLAN / SIMULATE only — none of them
 * sign or submit. The wallet (`owner`) and network (`mode`) are bound here from
 * the authenticated request, NOT chosen by the model: a rogue completion cannot
 * retarget another wallet or silently switch to mainnet.
 */

export interface ToolContext {
  connection: Connection;
  mode: Mode;
  owner: PublicKey;
  policyOverride?: PolicyOverride;
  allowMainnetSign?: boolean;
}

/** Resolve a requested amount to base units against the live balance. */
function resolveAmount(
  balanceBaseUnits: bigint,
  decimals: number,
  isNative: boolean,
  req: { amount?: number; fraction?: number }
): bigint {
  if (req.fraction != null) {
    const f = Math.max(0, Math.min(1, req.fraction));
    let out = (balanceBaseUnits * BigInt(Math.round(f * 1_000_000))) / 1_000_000n;
    // Keep a gas buffer when spending native SOL by fraction.
    if (isNative) {
      const buffer = BigInt(Math.round(0.01 * LAMPORTS_PER_SOL));
      out = out > buffer ? out - buffer : out;
    }
    return out;
  }
  if (req.amount != null) {
    return BigInt(Math.round(req.amount * 10 ** decimals));
  }
  throw new Error("Specify either an absolute amount or a fraction.");
}

async function balanceOf(
  ctx: ToolContext,
  mint: string,
  decimals: number
): Promise<bigint> {
  if (mint === NATIVE_SOL) {
    return BigInt(await ctx.connection.getBalance(ctx.owner, "confirmed"));
  }
  const ata = getAssociatedTokenAddress(new PublicKey(mint), ctx.owner);
  const { amount } = await readTokenBalance(ctx.connection, ata);
  return amount;
}

export function createTools(ctx: ToolContext) {
  const { connection, mode, owner } = ctx;

  return {
    read_balances: tool({
      description:
        "Read the connected wallet's balances (native SOL and all SPL tokens) with best-effort USD values. Use this first to ground any amount like 'half my USDC'.",
      inputSchema: z.object({}),
      execute: async () => {
        const lines = await readBalances(connection, mode, owner);
        return {
          mode,
          owner: owner.toBase58(),
          balances: lines,
        };
      },
    }),

    quote_swap: tool({
      description:
        "Get a Jupiter swap quote (route, out amount, price impact) WITHOUT building a transaction. Mainnet only. Useful to preview numbers before planning.",
      inputSchema: z.object({
        inputSymbol: z.string().describe("e.g. SOL, USDC"),
        outputSymbol: z.string().describe("e.g. JitoSOL, USDC"),
        amount: z.number().optional().describe("absolute amount in input token UI units"),
        fraction: z
          .number()
          .optional()
          .describe("fraction of the input balance, 0..1 (e.g. 0.5 for half)"),
        slippageBps: z.number().optional().default(50),
      }),
      execute: async (input) => {
        if (mode !== "mainnet")
          return { error: "Swaps run on mainnet in this demo. Switch to mainnet mode." };
        const inMeta = tokenBySymbol(input.inputSymbol);
        const outMeta = tokenBySymbol(input.outputSymbol);
        if (!inMeta?.mints.mainnet || !outMeta?.mints.mainnet)
          return { error: `Unknown token: ${input.inputSymbol} or ${input.outputSymbol}` };
        const inMint = inMeta.mints.mainnet;
        const bal = await balanceOf(ctx, inMint, inMeta.decimals);
        const amount = resolveAmount(bal, inMeta.decimals, inMint === NATIVE_SOL, input);
        if (amount <= 0n) return { error: "Resolved amount is zero — insufficient balance." };
        const { route } = await getJupiterQuote({
          inputMint: inMint,
          outputMint: outMeta.mints.mainnet,
          amount,
          slippageBps: input.slippageBps ?? 50,
        });
        return { route, inputAmountBaseUnits: amount.toString() };
      },
    }),

    build_transfer_plan: tool({
      description:
        "Build, simulate, and guardrail a transfer of SOL or an SPL token to a destination address. Returns a typed Plan the UI renders. Does NOT sign or send.",
      inputSchema: z.object({
        destination: z.string().describe("recipient base58 public key or SNS name (e.g. name.sol)"),
        symbol: z.string().describe("token symbol, e.g. SOL or USDC"),
        amount: z.number().optional().describe("absolute amount in UI units"),
        fraction: z.number().optional().describe("fraction of balance 0..1"),
      }),
      execute: async (input) => {
        const meta = tokenBySymbol(input.symbol);
        const mint = meta?.mints[mode];
        if (!meta || !mint)
          return { error: `Token ${input.symbol} is not available on ${mode}.` };
        // Resolve an SNS name before validating the address.
        let destStr = input.destination.trim();
        let snsName: string | null = null;
        if (isSolName(destStr)) {
          const resolved = await resolveSolDomain(destStr);
          if (!resolved)
            return { error: `Could not resolve SNS name ${destStr} — it may be unregistered.` };
          snsName = destStr;
          destStr = resolved;
        }
        let dest: PublicKey;
        try {
          dest = new PublicKey(destStr);
        } catch {
          return { error: `Invalid destination address: ${destStr}` };
        }
        const bal = await balanceOf(ctx, mint, meta.decimals);
        const amount = resolveAmount(bal, meta.decimals, mint === NATIVE_SOL, input);
        if (amount <= 0n) return { error: "Resolved amount is zero." };
        if (amount > bal)
          return { error: "Amount exceeds balance." };

        const built = await buildTransfer({
          connection,
          mode,
          owner,
          dest,
          mint,
          decimals: meta.decimals,
          symbol: meta.symbol,
          amountBaseUnits: amount,
        });
        const ui = Number(amount) / 10 ** meta.decimals;
        const destLabel = snsName
          ? `${snsName} (${destStr.slice(0, 4)}…${destStr.slice(-4)})`
          : `${destStr.slice(0, 4)}…${destStr.slice(-4)}`;
        const plan = await assemblePlan({
          connection,
          mode,
          owner,
          kind: "transfer",
          intentSummary: `Send ${ui} ${meta.symbol} to ${destLabel}`,
          tx: built.tx,
          watchedAssets: built.watchedAssets,
          route: null,
          quote: null,
          recipient: destStr,
          policyOverride: ctx.policyOverride,
          allowMainnetSign: ctx.allowMainnetSign,
        });
        return plan;
      },
    }),

    build_swap_plan: tool({
      description:
        "Build, simulate, and guardrail a Jupiter swap (e.g. USDC → JitoSOL). Mainnet only (read-only preview). Returns a typed Plan. Does NOT sign or send.",
      inputSchema: z.object({
        inputSymbol: z.string(),
        outputSymbol: z.string(),
        amount: z.number().optional(),
        fraction: z.number().optional(),
        slippageBps: z.number().optional().default(50),
      }),
      execute: async (input) => {
        if (mode !== "mainnet")
          return {
            error:
              "Swaps run on mainnet in this demo (read-only: real quote/sim/diff, signing disabled). Switch to mainnet mode.",
          };
        const inMeta = tokenBySymbol(input.inputSymbol);
        const outMeta = tokenBySymbol(input.outputSymbol);
        if (!inMeta?.mints.mainnet || !outMeta?.mints.mainnet)
          return { error: `Unknown token: ${input.inputSymbol} or ${input.outputSymbol}` };
        const inMint = inMeta.mints.mainnet;
        const outMint = outMeta.mints.mainnet;

        const bal = await balanceOf(ctx, inMint, inMeta.decimals);
        const amount = resolveAmount(bal, inMeta.decimals, inMint === NATIVE_SOL, input);
        if (amount <= 0n)
          return { error: "Resolved amount is zero — insufficient balance for this input." };

        const { route, quoteResponse, fetchedAt } = await getJupiterQuote({
          inputMint: inMint,
          outputMint: outMint,
          amount,
          slippageBps: input.slippageBps ?? 50,
        });
        const { tx } = await buildJupiterSwapTx({
          quoteResponse,
          userPublicKey: owner.toBase58(),
        });

        // Watch native SOL (fees/wrap), the input, and the output. wSOL is
        // watched as a token whenever SOL is one of the legs.
        const watched: WatchedAsset[] = [
          { mint: NATIVE_SOL, symbol: "SOL", decimals: SOL_DECIMALS, native: true },
        ];
        for (const [mint, meta] of [
          [inMint, inMeta],
          [outMint, outMeta],
        ] as const) {
          if (mint === NATIVE_SOL) {
            watched.push({ mint: NATIVE_SOL, symbol: "wSOL", decimals: SOL_DECIMALS, native: false });
          } else {
            watched.push({ mint, symbol: meta.symbol, decimals: meta.decimals });
          }
        }

        const inUi = Number(amount) / 10 ** inMeta.decimals;
        const minOutUi = Number(route.otherAmountThreshold) / 10 ** outMeta.decimals;
        const plan = await assemblePlan({
          connection,
          mode,
          owner,
          kind: "swap",
          intentSummary: `Swap ${inUi} ${inMeta.symbol} → ${outMeta.symbol} (min ${minOutUi.toFixed(4)} out)`,
          tx,
          watchedAssets: watched,
          route,
          quote: { fetchedAt, ttlMs: 20_000 },
          policyOverride: ctx.policyOverride,
          allowMainnetSign: ctx.allowMainnetSign,
        });
        return plan;
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof createTools>;

/** Whether the current mode can actually execute (devnet) or is read-only. */
export function modeExecutes(mode: Mode): boolean {
  return modeAllowsSigning(mode);
}
