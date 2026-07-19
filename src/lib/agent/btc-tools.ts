import { tool } from "ai";
import type { PolicyOverride } from "@/lib/guardrails/policy";
import { z } from "zod";
import type { Mode, BalanceLine } from "@/lib/types";
import { getUtxos, getFeeRates, getBtcUsdPrice } from "@/lib/btc/api";
import { assembleBtcPlan } from "@/lib/btc/plan";

/** Bitcoin tools. owner is the connected BTC address, bound from the request. */
export interface BtcToolContext {
  mode: Mode;
  owner: string;
  /** Sender public key (hex) — needed to build Taproot PSBTs. */
  publicKey?: string | null;
  policyOverride?: PolicyOverride;
}

const SATS = 100_000_000;

export function createBtcTools(ctx: BtcToolContext) {
  const { mode, owner, publicKey } = ctx;
  return {
    read_balances: tool({
      description:
        "Read the connected Bitcoin address's confirmed balance (from UTXOs), USD-priced on mainnet.",
      inputSchema: z.object({}),
      execute: async () => {
        const utxos = await getUtxos(mode, owner);
        const sats = utxos
          .filter((u) => u.status.confirmed)
          .reduce((s, u) => s + u.value, 0);
        const price = mode === "mainnet" ? await getBtcUsdPrice() : null;
        const balances: BalanceLine[] = [
          {
            mint: "BTC",
            symbol: "BTC",
            decimals: 8,
            amount: sats.toString(),
            uiAmount: sats / SATS,
            usd: price != null ? (sats / SATS) * price : null,
            isNative: true,
          },
        ];
        return { mode, owner, balances };
      },
    }),

    build_transfer_plan: tool({
      description:
        "Build a Bitcoin transfer: select coins, construct a PSBT, and preview inputs/outputs and fee. No on-chain simulation (UTXO chain). Returns a typed Plan. Does NOT sign or broadcast.",
      inputSchema: z.object({
        destination: z.string().describe("recipient BTC address (bech32 preferred)"),
        amount: z.number().describe("amount in BTC"),
        feePriority: z
          .enum(["fastest", "halfHour", "hour"])
          .optional()
          .default("halfHour"),
      }),
      execute: async (input) => {
        const amountSat = Math.round(input.amount * SATS);
        if (amountSat <= 0) return { error: "Amount must be positive." };
        const rates = await getFeeRates(mode);
        const feeRate = rates[input.feePriority ?? "halfHour"];
        try {
          return await assembleBtcPlan({
            mode,
            fromAddress: owner,
            toAddress: input.destination,
            amountSat,
            feeRateSatVb: feeRate,
            senderPublicKey: publicKey,
            policyOverride: ctx.policyOverride,
            intentSummary: `Send ${input.amount} BTC to ${input.destination.slice(0, 6)}…${input.destination.slice(-4)}`,
          });
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
  };
}
