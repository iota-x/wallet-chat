import type { Chain, Mode } from "./types";
import { getConnection } from "./solana/connection";
import { evmRpc, btcApiBase } from "./chains";
import type { TxStatus } from "./tx-store";

/**
 * Poll a chain for a transaction's confirmation. Runs client-side. Returns
 * "pending" until the network confirms (or reports failure). Never throws — a
 * network hiccup just reads as "pending" so we retry.
 */
export async function checkTxStatus(
  chain: Chain,
  mode: Mode,
  signature: string
): Promise<TxStatus> {
  try {
    if (chain === "solana") {
      const conn = getConnection(mode);
      const res = await conn.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      const v = res.value;
      if (!v) return "pending";
      if (v.err) return "failed";
      return v.confirmationStatus === "confirmed" ||
        v.confirmationStatus === "finalized"
        ? "confirmed"
        : "pending";
    }

    if (chain === "ethereum") {
      const receipt = await rpc(mode, "eth_getTransactionReceipt", [signature]);
      if (!receipt) return "pending";
      const status = (receipt as { status?: string }).status;
      return status === "0x1" ? "confirmed" : status === "0x0" ? "failed" : "pending";
    }

    // bitcoin
    const res = await fetch(`${btcApiBase(mode)}/tx/${signature}/status`, {
      cache: "no-store",
    });
    if (!res.ok) return "pending"; // 404 = not yet propagated
    const j = (await res.json()) as { confirmed?: boolean };
    return j.confirmed ? "confirmed" : "pending";
  } catch {
    return "pending";
  }
}

async function rpc(mode: Mode, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(evmRpc(mode), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: unknown };
  return json.result ?? null;
}
