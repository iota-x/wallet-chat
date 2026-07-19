import {
  encodeFunctionData,
  decodeFunctionResult,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import type { Mode } from "@/lib/types";
import { rpc } from "./rpc";
import {
  MULTICALL3,
  MULTICALL3_ABI,
  ERC20_ABI,
  EVM_TOKENS,
  KNOWN_SPENDERS,
  isNativeEth,
} from "./constants";

/**
 * ALLOWANCE VIEWER — see (and revoke) standing ERC-20 approvals.
 *
 * A live indexer would enumerate every approval you've ever granted from logs.
 * Without one, we take the reliable subset: read `allowance(owner, spender)` for
 * each curated token against each known spender (the DEX routers this app can
 * cause approvals to) in a single Multicall3 read, and keep the non-zero ones.
 * This always surfaces the approvals WalletChat itself could create; it does not
 * discover allowances to arbitrary spenders granted elsewhere (see UI note).
 */

const UNLIMITED_THRESHOLD = 2n ** 255n;

export interface Allowance {
  token: { symbol: string; address: string; decimals: number };
  spender: string;
  spenderLabel: string | null;
  /** Raw allowance in base units, decimal string. */
  amount: string;
  unlimited: boolean;
}

/** (token, spender) pairs to probe: curated tokens with an address on this tier
 * × the known spender set. */
function pairs(mode: Mode): {
  token: { symbol: string; address: Address; decimals: number };
  spender: Address;
  spenderLabel: string;
}[] {
  const out: {
    token: { symbol: string; address: Address; decimals: number };
    spender: Address;
    spenderLabel: string;
  }[] = [];
  for (const meta of Object.values(EVM_TOKENS)) {
    const addr = meta.addresses[mode];
    if (!addr || isNativeEth(addr)) continue; // native ETH has no allowance
    for (const s of KNOWN_SPENDERS) {
      out.push({
        token: { symbol: meta.symbol, address: addr as Address, decimals: meta.decimals },
        spender: s.address as Address,
        spenderLabel: s.label,
      });
    }
  }
  return out;
}

export async function getAllowances(mode: Mode, owner: Address): Promise<Allowance[]> {
  const probes = pairs(mode);
  if (probes.length === 0) return [];

  const calls = probes.map((p) => ({
    target: p.token.address,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, p.spender],
    }),
  }));

  const data = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [calls],
  });
  const ret = await rpc<Hex>(mode, "eth_call", [{ to: MULTICALL3, data }, "latest"]);
  const results = decodeFunctionResult({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    data: ret,
  }) as readonly { success: boolean; returnData: Hex }[];

  const allowances: Allowance[] = [];
  probes.forEach((p, i) => {
    const r = results[i];
    if (!r?.success || r.returnData === "0x") return;
    const amount = BigInt(r.returnData);
    if (amount === 0n) return;
    allowances.push({
      token: { symbol: p.token.symbol, address: p.token.address, decimals: p.token.decimals },
      spender: p.spender,
      spenderLabel: p.spenderLabel,
      amount: amount.toString(),
      unlimited: amount >= UNLIMITED_THRESHOLD,
    });
  });
  // Largest / unlimited risk first.
  allowances.sort((a, b) => (a.unlimited === b.unlimited ? 0 : a.unlimited ? -1 : 1));
  return allowances;
}

/** Validate a (token, spender) pair for the revoke route. */
export function normalizeApprovalTarget(
  token: string,
  spender: string
): { token: Address; spender: Address } | null {
  try {
    return { token: getAddress(token), spender: getAddress(spender) };
  } catch {
    return null;
  }
}
