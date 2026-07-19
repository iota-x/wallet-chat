import {
  createPublicClient,
  http,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { PublicKey } from "@solana/web3.js";
import { evmRpc } from "@/lib/chains";

/**
 * Human-readable name resolution — ENS (name.eth) and SNS (name.sol).
 *
 * Names always resolve on their home network's MAINNET (ENS on Ethereum
 * mainnet, SNS on Solana mainnet) regardless of the app's active tier, because
 * that is where the registries live. Resolution runs server-side in the transfer
 * tool BEFORE the address is validated, so the resolved address flows through
 * the same guardrails, blocklist, and recipient screening as a pasted one.
 *
 * ENS uses viem directly. SNS uses Bonfida's keyless resolver HTTP endpoint (the
 * same "no SDK, no key" approach we use for Jupiter / KyberSwap / mempool.space)
 * — the full SNS SDK pulls in a conflicting borsh build, and this avoids it.
 */

export function isEnsName(s: string): boolean {
  return /\.eth$/i.test(s.trim());
}
export function isSolName(s: string): boolean {
  return /\.sol$/i.test(s.trim());
}

let ensClient: PublicClient | null = null;
function ens(): PublicClient {
  if (!ensClient) {
    ensClient = createPublicClient({
      chain: mainnet,
      transport: http(evmRpc("mainnet")),
    });
  }
  return ensClient;
}

/** Resolve name.eth → 0x address, or null if unregistered / unresolvable. */
export async function resolveEnsName(name: string): Promise<string | null> {
  try {
    const addr = await ens().getEnsAddress({ name: normalize(name.trim()) });
    return addr ?? null;
  } catch {
    return null;
  }
}

/** Reverse ENS: 0x address → primary name, or null. Best-effort, for display. */
export async function reverseEnsName(address: string): Promise<string | null> {
  try {
    const name = await ens().getEnsName({ address: address as `0x${string}` });
    return name ?? null;
  } catch {
    return null;
  }
}

const SNS_RESOLVER = "https://sns-sdk-proxy.bonfida.workers.dev/resolve";

/** Resolve name.sol → base58 owner, or null if unregistered / unresolvable. */
export async function resolveSolDomain(name: string): Promise<string | null> {
  try {
    const domain = name.trim().replace(/\.sol$/i, "").toLowerCase();
    if (!domain) return null;
    const res = await fetch(`${SNS_RESOLVER}/${encodeURIComponent(domain)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { s?: string; result?: string };
    if (json.s !== "ok" || !json.result) return null;
    // Validate it's a real base58 pubkey before trusting it.
    return new PublicKey(json.result).toBase58();
  } catch {
    return null;
  }
}
