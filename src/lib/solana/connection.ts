import { Connection } from "@solana/web3.js";
import type { Mode } from "@/lib/types";
import { rpcEndpoint } from "./constants";

/**
 * Connections are cheap but we memoize per endpoint so we reuse the same
 * fetch/agent. "confirmed" is the right commitment for simulation and balance
 * reads: it's fast and reflects what a submitted tx will actually see, while
 * "processed" can show state that gets rolled back.
 */
const cache = new Map<string, Connection>();

export function getConnection(mode: Mode): Connection {
  const endpoint = rpcEndpoint(mode);
  const existing = cache.get(endpoint);
  if (existing) return existing;
  const conn = new Connection(endpoint, {
    commitment: "confirmed",
    // A generous but bounded timeout — simulation over a busy RPC can be slow.
    confirmTransactionInitialTimeout: 30_000,
  });
  cache.set(endpoint, conn);
  return conn;
}
