import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import type { Mode } from "@/lib/types";
import { NATIVE_SOL, SOL_DECIMALS } from "./constants";
import { getAssociatedTokenAddress } from "./tokens";
import type { WatchedAsset } from "./simulate";

/**
 * Server-side transaction BUILDERS. These produce UNSIGNED versioned
 * transactions only. Nothing here signs, and nothing here submits — that is a
 * hard invariant. The client is the sole signer/submitter, and only after the
 * plan is simulated and the guardrails pass.
 */

export interface BuildOptions {
  /** Priority fee in micro-lamports per compute unit. */
  priorityMicroLamports?: number;
  /** Compute unit limit to request. */
  computeUnitLimit?: number;
}

export interface BuiltTx {
  tx: VersionedTransaction;
  programIds: string[];
  watchedAssets: WatchedAsset[];
  /** New token accounts this tx creates (best-effort; sim is authoritative). */
  createdAtaCount: number;
  priorityMicroLamports: number;
  computeUnitLimit: number;
}

const DEFAULT_PRIORITY = Number(process.env.PRIORITY_MICRO_LAMPORTS ?? 20_000);

function computeBudgetIxs(
  limit: number,
  microLamports: number
): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: limit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}

async function compile(
  connection: Connection,
  owner: PublicKey,
  ixs: TransactionInstruction[]
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

/** Unique program IDs referenced by a set of instructions. */
function programIdsOf(ixs: TransactionInstruction[]): string[] {
  return Array.from(new Set(ixs.map((ix) => ix.programId.toBase58())));
}

/**
 * Build a transfer of `amountBaseUnits` of `mint` from `owner` to `dest`.
 * Handles native SOL and SPL tokens, creating the recipient ATA idempotently
 * when needed (rent shows up in the simulated diff automatically).
 */
export async function buildTransfer(params: {
  connection: Connection;
  mode: Mode;
  owner: PublicKey;
  dest: PublicKey;
  mint: string;
  decimals: number;
  symbol: string;
  amountBaseUnits: bigint;
  options?: BuildOptions;
}): Promise<BuiltTx> {
  const {
    connection,
    owner,
    dest,
    mint,
    decimals,
    symbol,
    amountBaseUnits,
    options,
  } = params;

  const priority = options?.priorityMicroLamports ?? DEFAULT_PRIORITY;
  const cuLimit = options?.computeUnitLimit ?? (mint === NATIVE_SOL ? 20_000 : 60_000);
  const ixs: TransactionInstruction[] = computeBudgetIxs(cuLimit, priority);
  let createdAtaCount = 0;
  const watched: WatchedAsset[] = [
    { mint: NATIVE_SOL, symbol: "SOL", decimals: SOL_DECIMALS },
  ];

  if (mint === NATIVE_SOL) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: dest,
        lamports: amountBaseUnits,
      })
    );
  } else {
    const mintPk = new PublicKey(mint);
    const ownerAta = getAssociatedTokenAddress(mintPk, owner);
    const destAta = getAssociatedTokenAddress(mintPk, dest);

    const destInfo = await connection.getAccountInfo(destAta, "confirmed");
    if (!destInfo) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          owner, // payer funds the recipient's ATA
          destAta,
          dest,
          mintPk
        )
      );
      createdAtaCount += 1;
    }
    ixs.push(
      createTransferCheckedInstruction(
        ownerAta,
        mintPk,
        destAta,
        owner,
        amountBaseUnits,
        decimals
      )
    );
    watched.push({ mint, symbol, decimals });
  }

  const tx = await compile(connection, owner, ixs);
  return {
    tx,
    programIds: programIdsOf(ixs),
    watchedAssets: watched,
    createdAtaCount,
    priorityMicroLamports: priority,
    computeUnitLimit: cuLimit,
  };
}

/** Wrap `lamports` of native SOL into wSOL held by `owner`. */
export async function buildWrap(params: {
  connection: Connection;
  owner: PublicKey;
  lamports: bigint;
  options?: BuildOptions;
}): Promise<BuiltTx> {
  const { connection, owner, lamports, options } = params;
  const priority = options?.priorityMicroLamports ?? DEFAULT_PRIORITY;
  const cuLimit = options?.computeUnitLimit ?? 40_000;
  const wsolMint = new PublicKey(NATIVE_SOL);
  const wsolAta = getAssociatedTokenAddress(wsolMint, owner);

  const info = await connection.getAccountInfo(wsolAta, "confirmed");
  let createdAtaCount = 0;
  const ixs: TransactionInstruction[] = computeBudgetIxs(cuLimit, priority);
  if (!info) {
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        owner,
        wsolAta,
        owner,
        wsolMint
      )
    );
    createdAtaCount += 1;
  }
  ixs.push(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: wsolAta,
      lamports,
    }),
    createSyncNativeInstruction(wsolAta)
  );

  const tx = await compile(connection, owner, ixs);
  return {
    tx,
    programIds: programIdsOf(ixs),
    watchedAssets: [
      { mint: NATIVE_SOL, symbol: "SOL", decimals: SOL_DECIMALS, native: true },
      { mint: NATIVE_SOL, symbol: "wSOL", decimals: SOL_DECIMALS, native: false },
    ],
    createdAtaCount,
    priorityMicroLamports: priority,
    computeUnitLimit: cuLimit,
  };
}
