import type { GuardrailCheck } from "@/lib/types";

/**
 * KNOWN-BAD ADDRESS BLOCKLIST — a bundled reputation layer.
 *
 * Simulation proves a transaction is well-formed; it can't tell you the
 * destination is a sanctioned mixer or a drainer's collection wallet. Live
 * feeds (Blockaid, Blowfish) do that but need a paid key. This is the free,
 * offline version: a bundled SNAPSHOT of publicly-published bad addresses,
 * screened against the recipient and any approval spender as a hard block.
 *
 * ── HONESTY ABOUT THE DATA ───────────────────────────────────────────────────
 * • "sanctioned" is the OFAC SDN crypto set (Tornado Cash pools/router, Lazarus
 *   Group wallets) — authoritative public record, stable, low false-positive.
 * • "scam" (phishing/drainer collection wallets) rotates weekly, so a static
 *   bundle is inherently partial. The screening MECHANISM covers it; keep the
 *   data fresh from the upstreams below rather than trusting this snapshot.
 *
 * Refresh (snapshot bundled 2026-07-19):
 *   OFAC : github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
 *   Scam : github.com/scamsniffer/scam-database · ethereum-lists/ethereum-lists
 */

export type BlockCategory = "sanctioned" | "scam";

export interface BlockEntry {
  category: BlockCategory;
  reason: string;
  source: string;
}

/** Keyed by lowercased address. EVM is case-insensitive; base58/bech32 are
 * lowercased consistently on both sides, and cross-collisions are impossible. */
const ENTRIES: Record<string, BlockEntry> = {
  // ── OFAC SDN — Tornado Cash (sanctioned 2022-08-08) ──────────────────────
  "0x8589427373d6d84e98730d7795d8f6f8731fda16": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash (donation address)",
    source: "OFAC",
  },
  "0x722122df12d4e14e13ac3b6895a86e84145b6967": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash router",
    source: "OFAC",
  },
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash",
    source: "OFAC",
  },
  "0xdd4c48c0b24039969fc16d1cdf626eab821d3384": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash",
    source: "OFAC",
  },
  "0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash 0.1 ETH pool",
    source: "OFAC",
  },
  "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash 1 ETH pool",
    source: "OFAC",
  },
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash 10 ETH pool",
    source: "OFAC",
  },
  "0xa160cdab225685da1d56aa342ad8841c3b53f291": {
    category: "sanctioned",
    reason: "OFAC SDN — Tornado Cash 100 ETH pool",
    source: "OFAC",
  },
  // ── OFAC SDN — Lazarus Group (DPRK) ──────────────────────────────────────
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96": {
    category: "sanctioned",
    reason: "OFAC SDN — Lazarus Group (Ronin bridge exploit)",
    source: "OFAC",
  },
  "0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b": {
    category: "sanctioned",
    reason: "OFAC SDN — Lazarus Group",
    source: "OFAC",
  },

  // ── scam / drainer — STARTER SNAPSHOT (refresh from upstream; rotates fast) ──
  // Intentionally minimal: static scam data goes stale in days. The screen runs
  // over whatever is here — populate it from the scamsniffer / ethereum-lists
  // feeds (build step or periodic sync) for real coverage.
};

/** Look up one address; null if clean. */
export function screenBlocklist(
  addr: string | null | undefined
): BlockEntry | null {
  if (!addr) return null;
  return ENTRIES[addr.trim().toLowerCase()] ?? null;
}

export const BLOCKLIST_SIZE = Object.keys(ENTRIES).length;

/**
 * Build the guardrail check for a set of addresses (recipient, approval spender).
 * Returns null when there's nothing to screen, so callers only push a check when
 * an outbound destination actually exists. A hit is a hard block.
 */
export function blocklistCheck(
  addresses: (string | null | undefined)[]
): GuardrailCheck | null {
  const targets = addresses.filter((a): a is string => !!a);
  if (targets.length === 0) return null;

  for (const a of targets) {
    const hit = screenBlocklist(a);
    if (hit) {
      return {
        id: "blocklist-screen",
        label: "Not a flagged address",
        severity: "block",
        passed: false,
        detail: `Blocked: ${a.slice(0, 6)}…${a.slice(-4)} is flagged — ${hit.reason}. Simulation can't see reputation; this is a bundled sanctions/scam screen.`,
      };
    }
  }
  return {
    id: "blocklist-screen",
    label: "Not a flagged address",
    severity: "block",
    passed: true,
    detail: `Destination is not on the bundled sanctions / known-scam blocklist (${BLOCKLIST_SIZE} entries).`,
  };
}
