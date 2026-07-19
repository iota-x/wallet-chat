import type { Chain, Mode } from "./types";
import type { ReconcileDelta } from "./tx-store";
import { getConnection } from "./solana/connection";
import { rpc } from "./evm/rpc";
import { evmTokenByAddress, NATIVE_ETH } from "./evm/constants";

/**
 * Fetch the ACTUAL per-asset movement for the owner from a confirmed tx.
 * Returns null when a chain offers nothing to reconcile against (Bitcoin: the
 * broadcast equals the PSBT preview by construction, so there is no drift to
 * measure). Server-side — needs RPC.
 */
export async function fetchActualDeltas(
  chain: Chain,
  mode: Mode,
  signature: string,
  owner: string
): Promise<ReconcileDelta[] | null> {
  if (chain === "solana") return solanaDeltas(mode, signature, owner);
  if (chain === "ethereum") return evmDeltas(mode, signature, owner);
  return null; // bitcoin — no post-state diff
}

async function solanaDeltas(
  mode: Mode,
  signature: string,
  owner: string
): Promise<ReconcileDelta[] | null> {
  const conn = getConnection(mode);
  const tx = await conn.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx || !tx.meta) return null;

  const out: ReconcileDelta[] = [];

  // Native SOL: post - pre at the owner's account index.
  const keys = tx.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k.pubkey.toBase58() === owner);
  if (idx >= 0) {
    const d = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 1e9;
    if (d !== 0) out.push({ symbol: "SOL", mint: "SOL", uiDelta: d, isNative: true });
  }

  // SPL tokens: net per mint over the owner's token accounts.
  const pre = (tx.meta.preTokenBalances ?? []).filter((b) => b.owner === owner);
  const post = (tx.meta.postTokenBalances ?? []).filter((b) => b.owner === owner);
  const mints = new Set([...pre, ...post].map((b) => b.mint));
  for (const mint of mints) {
    const p = pre.find((b) => b.mint === mint)?.uiTokenAmount.uiAmount ?? 0;
    const q = post.find((b) => b.mint === mint)?.uiTokenAmount.uiAmount ?? 0;
    const d = (q ?? 0) - (p ?? 0);
    if (d !== 0) out.push({ symbol: shortMint(mint), mint, uiDelta: d, isNative: false });
  }
  return out;
}

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function evmDeltas(
  mode: Mode,
  signature: string,
  owner: string
): Promise<ReconcileDelta[] | null> {
  const [receipt, txn] = await Promise.all([
    rpc<{
      gasUsed?: string;
      effectiveGasPrice?: string;
      logs?: { address: string; topics: string[]; data: string }[];
    } | null>(mode, "eth_getTransactionReceipt", [signature]),
    rpc<{ value?: string; from?: string; to?: string } | null>(
      mode,
      "eth_getTransactionByHash",
      [signature]
    ),
  ]);
  if (!receipt) return null;

  const ownerLc = owner.toLowerCase();
  const tokenWei: Record<string, bigint> = {};

  for (const log of receipt.logs ?? []) {
    if ((log.topics?.[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    if (log.topics.length < 3) continue;
    const from = topicAddr(log.topics[1]);
    const to = topicAddr(log.topics[2]);
    if (from !== ownerLc && to !== ownerLc) continue;
    const value = log.data && log.data !== "0x" ? BigInt(log.data) : 0n;
    const t = log.address.toLowerCase();
    tokenWei[t] = (tokenWei[t] ?? 0n) + (to === ownerLc ? value : 0n) - (from === ownerLc ? value : 0n);
  }

  const out: ReconcileDelta[] = [];
  for (const [addr, wei] of Object.entries(tokenWei)) {
    if (wei === 0n) continue;
    const meta = evmTokenByAddress(addr, mode);
    const decimals = meta?.decimals ?? 18;
    out.push({
      symbol: meta?.symbol ?? shortMint(addr),
      mint: addr,
      uiDelta: Number(wei) / 10 ** decimals,
      isNative: false,
    });
  }

  // Native ETH: -(gas) plus/minus any ETH value moved to/from the owner.
  const gasWei =
    receipt.gasUsed && receipt.effectiveGasPrice
      ? BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)
      : 0n;
  let nativeWei = 0n;
  if (txn?.from?.toLowerCase() === ownerLc) nativeWei -= gasWei;
  const value = txn?.value ? BigInt(txn.value) : 0n;
  if (value > 0n) {
    if (txn?.from?.toLowerCase() === ownerLc) nativeWei -= value;
    if (txn?.to?.toLowerCase() === ownerLc) nativeWei += value;
  }
  if (nativeWei !== 0n) {
    out.push({ symbol: "ETH", mint: NATIVE_ETH.toLowerCase(), uiDelta: Number(nativeWei) / 1e18, isNative: true });
  }
  return out;
}

function topicAddr(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}
function shortMint(m: string): string {
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}
