import {
  encodeFunctionData,
  decodeFunctionResult,
  numberToHex,
  type Address,
  type Hex,
} from "viem";
import type { Mode } from "@/lib/types";
import { evmRpc } from "@/lib/chains";
import { MULTICALL3, MULTICALL3_ABI, ERC20_ABI } from "./constants";

/** Minimal JSON-RPC caller. We drive eth_simulateV1 directly for full control. */
export async function rpc<T = unknown>(
  mode: Mode,
  method: string,
  params: unknown[]
): Promise<T> {
  const res = await fetch(evmRpc(mode), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

/**
 * Build one Multicall3.aggregate3 call that reads the owner's native balance
 * plus each token balance. Used for BOTH the pre-state read (eth_call at latest)
 * and the post-state read (a second call inside eth_simulateV1) so the decode is
 * byte-identical on both sides — the EVM analog of the Solana watch list.
 */
export function buildBalanceReader(
  owner: Address,
  tokens: Address[]
): {
  to: Address;
  data: Hex;
  decode: (ret: Hex) => { native: bigint; tokens: Record<string, bigint> };
} {
  const calls = [
    {
      target: MULTICALL3 as Address,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: "getEthBalance",
        args: [owner],
      }),
    },
    ...tokens.map((t) => ({
      target: t,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [owner],
      }),
    })),
  ];

  const data = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [calls],
  });

  const decode = (ret: Hex) => {
    const results = decodeFunctionResult({
      abi: MULTICALL3_ABI,
      functionName: "aggregate3",
      data: ret,
    }) as readonly { success: boolean; returnData: Hex }[];

    const native = results[0]?.success
      ? BigInt(results[0].returnData)
      : 0n;
    const tokenBalances: Record<string, bigint> = {};
    tokens.forEach((t, i) => {
      const r = results[i + 1];
      tokenBalances[t.toLowerCase()] =
        r?.success && r.returnData !== "0x" ? BigInt(r.returnData) : 0n;
    });
    return { native, tokens: tokenBalances };
  };

  return { to: MULTICALL3 as Address, data, decode };
}

/** Pre-state balances read live at the latest block. */
export async function readBalancesRaw(
  mode: Mode,
  owner: Address,
  tokens: Address[]
): Promise<{ native: bigint; tokens: Record<string, bigint> }> {
  const reader = buildBalanceReader(owner, tokens);
  const ret = await rpc<Hex>(mode, "eth_call", [
    { to: reader.to, data: reader.data },
    "latest",
  ]);
  return reader.decode(ret);
}

export { numberToHex };
