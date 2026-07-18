import { numberToHex, type Address, type Hex } from "viem";
import type { AssetDelta, SimulationResult, Mode, EvmTxRequest } from "@/lib/types";
import { NATIVE_ETH, evmTokenByAddress } from "./constants";
import { rpc, buildBalanceReader, readBalancesRaw } from "./rpc";

/**
 * THE EVM CROWN JEWEL — exact balance-diff decode from real simulated state.
 *
 * Mirrors the Solana approach: we never trust the swap quote for the diff. We
 * read the owner's real balances now (pre), simulate the transaction with
 * eth_simulateV1, and — in the SAME simulated block, right after the tx — read
 * the balances again via Multicall3 (post). The signed difference is the truth.
 *
 * Two correctness details that make it exact:
 *  • validation:true charges gas to the sender, so the native (ETH) delta folds
 *    in the gas cost exactly, the way Solana's native delta folds in the fee.
 *  • The post-read call is sent from a throwaway address whose balance we
 *    override, so the read's OWN gas never perturbs the owner's ETH balance.
 *
 * Supported by any eth_simulateV1-capable RPC (Geth ≥1.13, publicnode, Alchemy…).
 */

const READER_FROM = "0x000000000000000000000000000000000000dEaD" as Address;

export interface EvmWatchedToken {
  address: string; // token contract; NATIVE_ETH sentinel is ignored (native always watched)
  symbol: string;
  decimals: number;
}

interface SimCallResult {
  status?: Hex;
  returnData?: Hex;
  gasUsed?: Hex;
  error?: { message?: string; code?: number };
  logs?: unknown[];
}
interface SimBlockResult {
  calls?: SimCallResult[];
  baseFeePerGas?: Hex;
}

export interface EvmDiffResult {
  simulation: SimulationResult;
  diff: AssetDelta[];
  gasUsed: bigint;
  /** Gas cost in wei = gasUsed * effective price. Display-only. */
  feeWei: bigint;
}

export async function decodeEvmDiff(
  mode: Mode,
  owner: Address,
  evmTx: EvmTxRequest,
  watched: EvmWatchedToken[]
): Promise<EvmDiffResult> {
  const tokenAddrs = watched
    .filter((w) => w.address.toLowerCase() !== NATIVE_ETH.toLowerCase())
    .map((w) => w.address as Address);

  // 1) Pre-state (live, latest block).
  const pre = await readBalancesRaw(mode, owner, tokenAddrs);

  // 2) Simulate: [ the tx (from owner) , the post-state read (from READER) ].
  const reader = buildBalanceReader(owner, tokenAddrs);
  const simParams = [
    {
      blockStateCalls: [
        {
          // Fund the reader sender so its gas can't touch the owner's balance.
          stateOverrides: {
            [READER_FROM]: { balance: numberToHex(10n ** 18n) },
          },
          calls: [
            {
              from: owner,
              to: evmTx.to as Address,
              data: evmTx.data as Hex,
              value: numberToHex(BigInt(evmTx.value)),
              gas: numberToHex(BigInt(evmTx.gas)),
              maxFeePerGas: numberToHex(BigInt(evmTx.maxFeePerGas)),
              maxPriorityFeePerGas: numberToHex(BigInt(evmTx.maxPriorityFeePerGas)),
            },
            {
              from: READER_FROM,
              to: reader.to,
              data: reader.data,
              gas: numberToHex(3_000_000n),
              maxFeePerGas: numberToHex(BigInt(evmTx.maxFeePerGas)),
              maxPriorityFeePerGas: numberToHex(BigInt(evmTx.maxPriorityFeePerGas)),
            },
          ],
        },
      ],
      validation: true,
      traceTransfers: false,
      returnFullTransactions: false,
    },
    "latest",
  ];

  let blocks: SimBlockResult[];
  try {
    blocks = await rpc<SimBlockResult[]>(mode, "eth_simulateV1", simParams);
  } catch (e) {
    return {
      simulation: {
        success: false,
        err: (e as Error).message,
        logs: [(e as Error).message],
        unitsConsumed: null,
        computeUnitLimit: Number(evmTx.gas),
        blockhash: null,
      },
      diff: [],
      gasUsed: 0n,
      feeWei: 0n,
    };
  }

  const call0 = blocks?.[0]?.calls?.[0];
  const call1 = blocks?.[0]?.calls?.[1];
  const success = call0?.status === "0x1";
  const gasUsed = call0?.gasUsed ? BigInt(call0.gasUsed) : 0n;

  // Effective gas price the sim charged: baseFee + priority (maxFee is headroom).
  const baseFee = blocks?.[0]?.baseFeePerGas ? BigInt(blocks[0].baseFeePerGas!) : 0n;
  const priority = BigInt(evmTx.maxPriorityFeePerGas);
  const maxFee = BigInt(evmTx.maxFeePerGas);
  const effectivePrice = baseFee + (priority < maxFee - baseFee ? priority : maxFee - baseFee > 0n ? maxFee - baseFee : 0n);
  const feeWei = gasUsed * effectivePrice;

  const simulation: SimulationResult = {
    success,
    err: success ? null : call0?.error?.message ?? "Simulation reverted.",
    logs: success
      ? [`gasUsed ${gasUsed.toString()}`]
      : [call0?.error?.message ?? "revert", `gasUsed ${gasUsed.toString()}`],
    unitsConsumed: Number(gasUsed),
    computeUnitLimit: Number(evmTx.gas),
    blockhash: null,
  };

  if (!success || !call1?.returnData || call1.returnData === "0x") {
    return { simulation, diff: [], gasUsed, feeWei };
  }

  // 3) Post-state and exact signed diff.
  const post = reader.decode(call1.returnData);
  const diff: AssetDelta[] = [];

  const nativeDelta = post.native - pre.native;
  if (nativeDelta !== 0n) {
    diff.push(makeDelta("ETH", NATIVE_ETH, 18, pre.native, post.native, true, false));
  }

  for (const w of watched) {
    if (w.address.toLowerCase() === NATIVE_ETH.toLowerCase()) continue;
    const key = w.address.toLowerCase();
    const preAmt = pre.tokens[key] ?? 0n;
    const postAmt = post.tokens[key] ?? 0n;
    if (postAmt === preAmt) continue;
    const meta = evmTokenByAddress(w.address, mode);
    diff.push(
      makeDelta(
        meta?.symbol ?? w.symbol,
        w.address,
        meta?.decimals ?? w.decimals,
        preAmt,
        postAmt,
        false,
        false
      )
    );
  }

  return { simulation, diff, gasUsed, feeWei };
}

function makeDelta(
  symbol: string,
  mint: string,
  decimals: number,
  pre: bigint,
  post: bigint,
  isNative: boolean,
  ataCreated: boolean
): AssetDelta {
  const delta = post - pre;
  return {
    mint,
    symbol,
    decimals,
    preAmount: pre.toString(),
    postAmount: post.toString(),
    delta: delta.toString(),
    uiDelta: Number(delta) / 10 ** decimals,
    usd: null,
    isNative,
    ataCreated,
  };
}
