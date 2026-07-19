import type { Chain, Mode, PlanKind } from "./types";

/**
 * Client-side record of transactions the user actually signed & broadcast.
 * Stored in localStorage so a user can always find a past signature + explorer
 * link. Written from PlanPreview the moment a transaction is confirmed.
 */

export type TxStatus = "pending" | "confirmed" | "failed";

export interface TxRecord {
  id: string;
  chain: Chain;
  mode: Mode;
  kind: PlanKind;
  signature: string;
  owner: string;
  summary: string;
  /** e.g. "−250 USDC · +1.68 JitoSOL" */
  delta: string;
  ts: number;
  status: TxStatus;
}

const KEY = "wc-transactions-v1";

function read(): TxRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as TxRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: TxRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function recordTransaction(
  rec: Omit<TxRecord, "id" | "ts" | "status"> & { status?: TxStatus }
) {
  const list = read();
  // Avoid duplicates if a confirm callback fires twice.
  if (list.some((r) => r.signature === rec.signature)) return;
  list.unshift({
    status: "pending",
    ...rec,
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tx_${Date.now()}`,
    ts: Date.now(),
  });
  write(list.slice(0, 200));
}

export function updateTxStatus(id: string, status: TxStatus) {
  const list = read();
  const i = list.findIndex((r) => r.id === id);
  if (i >= 0 && list[i].status !== status) {
    list[i] = { ...list[i], status };
    write(list);
  }
}

export function listTransactions(): TxRecord[] {
  return read();
}

export function clearTransactions() {
  write([]);
}

export function explorerUrl(chain: Chain, mode: Mode, sig: string): string {
  const main = mode === "mainnet";
  if (chain === "solana")
    return `https://explorer.solana.com/tx/${sig}?cluster=${main ? "mainnet-beta" : "devnet"}`;
  if (chain === "ethereum")
    return `https://${main ? "" : "sepolia."}etherscan.io/tx/${sig}`;
  return `https://mempool.space/${main ? "" : "testnet4/"}tx/${sig}`;
}
