import {
  Connection,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import type { AssetDelta, SimulationResult, Mode } from "@/lib/types";
import { NATIVE_SOL, SOL_DECIMALS, tokenByMint } from "./constants";
import {
  decodeTokenAccount,
  getAssociatedTokenAddress,
  TOKEN_ACCOUNT_LEN,
} from "./tokens";

/**
 * THE CROWN JEWEL.
 *
 * Given an unsigned versioned transaction and the set of assets we care about,
 * we simulate against live chain state and decode the EXACT balance change for
 * the owner — derived purely from simulated post-account-state vs live
 * pre-account-state. No estimation, no trusting the quote: the source of truth
 * is what the chain says the accounts will look like after execution.
 *
 * Why this is the hard part (and why the brief makes us prove it on devnet):
 *  - A sim can PASS and execution still fail because chain state moved. We treat
 *    the sim as a point-in-time truth and re-sim before submit (see the agent).
 *  - The lamports delta on the fee payer folds together three things at once:
 *    the SOL actually moved, the network fee, and rent for any token account
 *    created by this tx. We read the fee payer's post-state directly so all
 *    three are captured — we never hand-add numbers the chain didn't confirm.
 *  - wSOL wrap/unwrap shows up correctly for free: a temporary wSOL account is
 *    just another watched token account; native lamports move to fund it and
 *    return on close, and the sim post-state reflects the net.
 *  - ATA creation is detected structurally: pre-account is null, post-account is
 *    a live token account. The rent shows up in the fee payer's lamports delta.
 */

export interface WatchedAsset {
  mint: string; // use NATIVE_SOL sentinel for native SOL
  symbol: string;
  decimals: number;
  /**
   * Force interpretation. Native SOL and wSOL share the same mint address
   * (So111…112): the former is the owner's system-account lamports, the latter
   * is an SPL token account. `native: false` watches the wSOL token account;
   * omitted/true means the system account. Without this, wrap/unwrap diffs are
   * silently wrong.
   */
  native?: boolean;
}

export interface DiffDecodeResult {
  simulation: SimulationResult;
  diff: AssetDelta[];
  /** The set of accounts we asked the sim to return, for debugging/proof. */
  watchedAddresses: string[];
}

interface SimAccount {
  lamports: number;
  data: [string, string]; // [base64, "base64"]
  owner: string;
  executable: boolean;
  rentEpoch: number;
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/**
 * Build the list of addresses to watch: the owner's native account (for SOL),
 * plus the owner's ATA for every non-native watched mint. Order is preserved so
 * we can zip pre-state, post-state, and metadata together deterministically.
 */
function buildWatchList(
  owner: PublicKey,
  assets: WatchedAsset[]
): { address: PublicKey; asset: WatchedAsset; isNative: boolean }[] {
  const list: {
    address: PublicKey;
    asset: WatchedAsset;
    isNative: boolean;
  }[] = [];

  // Native SOL is always watched — it's where fees and rent land.
  list.push({
    address: owner,
    asset: { mint: NATIVE_SOL, symbol: "SOL", decimals: SOL_DECIMALS },
    isNative: true,
  });

  const seen = new Set<string>();
  for (const asset of assets) {
    // Treat as native SOL only when explicitly native, or the SOL sentinel with
    // no override. wSOL passes native:false to be watched as a token account.
    const isNativeSol =
      asset.native === true || (asset.native === undefined && asset.mint === NATIVE_SOL);
    if (isNativeSol) continue; // native system account already watched above
    const key = `${asset.mint}:${asset.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ata = getAssociatedTokenAddress(new PublicKey(asset.mint), owner);
    list.push({ address: ata, asset, isNative: false });
  }
  return list;
}

export async function decodeBalanceDiff(
  connection: Connection,
  owner: PublicKey,
  assets: WatchedAsset[],
  tx: VersionedTransaction,
  mode: Mode
): Promise<DiffDecodeResult> {
  const watch = buildWatchList(owner, assets);
  const addresses = watch.map((w) => w.address);

  // 1) Live pre-state for every watched account (one round-trip).
  const preInfos = await connection.getMultipleAccountsInfo(addresses, {
    commitment: "confirmed",
  });

  // 2) Simulate. sigVerify:false because the tx is unsigned; replaceRecentBlockhash
  //    so we don't race a stale blockhash. We request the post-state of exactly
  //    the accounts we watch.
  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: {
      encoding: "base64",
      addresses: addresses.map((a) => a.toBase58()),
    },
  });

  const value = sim.value;
  const simulation: SimulationResult = {
    success: value.err === null,
    err: value.err ?? null,
    logs: value.logs ?? [],
    unitsConsumed: value.unitsConsumed ?? null,
    computeUnitLimit: extractComputeUnitLimit(value.logs ?? []),
    blockhash:
      (value as { replacementBlockhash?: { blockhash: string } })
        .replacementBlockhash?.blockhash ?? null,
  };

  const postAccounts = (value.accounts ?? []) as (SimAccount | null)[];

  // 3) Decode each watched account: pre vs post → exact signed delta.
  const diff: AssetDelta[] = [];
  for (let i = 0; i < watch.length; i++) {
    const { asset, isNative } = watch[i];
    const pre = preInfos[i];
    const post = postAccounts[i];

    if (isNative) {
      const preLamports = BigInt(pre?.lamports ?? 0);
      const postLamports = BigInt(post?.lamports ?? preLamports);
      const delta = postLamports - preLamports;
      diff.push(
        makeDelta({
          mint: NATIVE_SOL,
          symbol: asset.symbol,
          decimals: asset.decimals,
          pre: preLamports,
          post: postLamports,
          delta,
          isNative: true,
          ataCreated: false,
        })
      );
      continue;
    }

    // SPL token account. Pre may be null (no ATA yet). Post may be a freshly
    // created token account (ATA creation) or updated balance.
    const preDecoded =
      pre && pre.data.length >= TOKEN_ACCOUNT_LEN
        ? decodeTokenAccount(pre.data)
        : null;
    const preAmount = preDecoded?.amount ?? 0n;

    let postAmount = preAmount;
    let ataCreated = false;
    if (post) {
      const postBytes = base64ToBytes(post.data[0]);
      const postDecoded = decodeTokenAccount(postBytes);
      postAmount = postDecoded?.amount ?? 0n;
      ataCreated = pre === null && postDecoded !== null;
    }

    const delta = postAmount - preAmount;
    // Skip assets that didn't move AND didn't get created — keeps the preview
    // focused on what actually changed.
    if (delta === 0n && !ataCreated) continue;

    diff.push(
      makeDelta({
        mint: asset.mint,
        symbol: asset.symbol,
        decimals: asset.decimals,
        pre: preAmount,
        post: postAmount,
        delta,
        isNative: false,
        ataCreated,
      })
    );
  }

  return {
    simulation,
    diff: enrichSymbols(diff, mode),
    watchedAddresses: addresses.map((a) => a.toBase58()),
  };
}

function makeDelta(args: {
  mint: string;
  symbol: string;
  decimals: number;
  pre: bigint;
  post: bigint;
  delta: bigint;
  isNative: boolean;
  ataCreated: boolean;
}): AssetDelta {
  const { mint, symbol, decimals, pre, post, delta, isNative, ataCreated } =
    args;
  return {
    mint,
    symbol,
    decimals,
    preAmount: pre.toString(),
    postAmount: post.toString(),
    delta: delta.toString(),
    uiDelta: Number(delta) / 10 ** decimals,
    usd: null, // priced later by the agent/pricing layer
    isNative,
    ataCreated,
  };
}

/** If the token registry knows a nicer symbol for a mint, use it. */
function enrichSymbols(diff: AssetDelta[], mode: Mode): AssetDelta[] {
  return diff.map((d) => {
    if (d.isNative) return d;
    // Don't relabel a wSOL token account as "SOL" — keep whatever it came in as.
    if (d.mint === NATIVE_SOL) return d;
    const meta = tokenByMint(d.mint, mode);
    return meta ? { ...d, symbol: meta.symbol, decimals: meta.decimals } : d;
  });
}

/** Parse the CU limit the tx requested from ComputeBudget program logs. */
function extractComputeUnitLimit(logs: string[]): number | null {
  for (const line of logs) {
    const m = line.match(/consumed \d+ of (\d+) compute units/);
    if (m) return Number(m[1]);
  }
  return null;
}
