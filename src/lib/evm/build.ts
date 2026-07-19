import {
  encodeFunctionData,
  numberToHex,
  type Address,
  type Hex,
} from "viem";
import type { Mode, EvmTxRequest } from "@/lib/types";
import { evmChainId } from "@/lib/chains";
import { ERC20_ABI, NATIVE_ETH, isNativeEth } from "./constants";
import { rpc } from "./rpc";
import type { EvmWatchedToken } from "./simulate";

/**
 * EVM transaction builders. Produce UNSIGNED tx requests only — the browser
 * wallet (MetaMask) signs and submits. Nothing here holds a key.
 */

export interface BuiltEvmTx {
  tx: EvmTxRequest;
  watched: EvmWatchedToken[];
  /** Contract/target addresses invoked — for the guardrail allowlist. */
  targets: string[];
}

/** EIP-1559 fees from the latest base fee + suggested priority fee. */
export async function estimateEvmFees(
  mode: Mode
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const [block, priorityHex] = await Promise.all([
    rpc<{ baseFeePerGas?: Hex }>(mode, "eth_getBlockByNumber", ["latest", false]),
    rpc<Hex>(mode, "eth_maxPriorityFeePerGas", []).catch(() => "0x3b9aca00" as Hex), // 1 gwei
  ]);
  const baseFee = block.baseFeePerGas ? BigInt(block.baseFeePerGas) : 1_000_000_000n;
  const priority = BigInt(priorityHex);
  // Headroom for base-fee drift between plan and inclusion.
  const maxFeePerGas = baseFee * 2n + priority;
  return { maxFeePerGas, maxPriorityFeePerGas: priority };
}

async function estimateGas(
  mode: Mode,
  from: Address,
  to: Address,
  data: Hex,
  value: bigint
): Promise<bigint> {
  try {
    const hex = await rpc<Hex>(mode, "eth_estimateGas", [
      { from, to, data, value: numberToHex(value) },
      "latest",
    ]);
    const est = BigInt(hex);
    return (est * 12n) / 10n; // +20% headroom
  } catch {
    // Fallback: native transfer 21k, token transfer ~65k.
    return data === "0x" ? 21_000n : 100_000n;
  }
}

/** Build an unsigned ERC-20 approve(spender, amount). amount 0n = a revoke. */
export async function buildEvmApproval(params: {
  mode: Mode;
  owner: Address;
  token: Address;
  spender: Address;
  amountBaseUnits: bigint;
}): Promise<BuiltEvmTx> {
  const { mode, owner, token, spender, amountBaseUnits } = params;
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amountBaseUnits],
  });
  const [{ maxFeePerGas, maxPriorityFeePerGas }, gas] = await Promise.all([
    estimateEvmFees(mode),
    estimateGas(mode, owner, token, data, 0n),
  ]);
  const tx: EvmTxRequest = {
    chainId: evmChainId(mode),
    from: owner,
    to: token,
    data,
    value: "0",
    gas: gas.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
  };
  // Watch the token (its balance won't change, but the diff decode expects a list)
  // plus native for the gas delta.
  return {
    tx,
    watched: [{ address: NATIVE_ETH, symbol: "ETH", decimals: 18 }],
    targets: [token.toLowerCase()],
  };
}

export async function buildEvmTransfer(params: {
  mode: Mode;
  owner: Address;
  to: Address;
  tokenAddress: string;
  decimals: number;
  symbol: string;
  amountBaseUnits: bigint;
}): Promise<BuiltEvmTx> {
  const { mode, owner, to, tokenAddress, decimals, symbol, amountBaseUnits } =
    params;

  let txTo: Address;
  let data: Hex;
  let value: bigint;
  const watched: EvmWatchedToken[] = [
    { address: NATIVE_ETH, symbol: "ETH", decimals: 18 },
  ];

  if (isNativeEth(tokenAddress)) {
    txTo = to;
    data = "0x";
    value = amountBaseUnits;
  } else {
    txTo = tokenAddress as Address;
    data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, amountBaseUnits],
    });
    value = 0n;
    watched.push({ address: tokenAddress, symbol, decimals });
  }

  const [{ maxFeePerGas, maxPriorityFeePerGas }, gas] = await Promise.all([
    estimateEvmFees(mode),
    estimateGas(mode, owner, txTo, data, value),
  ]);

  const tx: EvmTxRequest = {
    chainId: evmChainId(mode),
    from: owner,
    to: txTo,
    data,
    value: value.toString(),
    gas: gas.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
  };

  return { tx, watched, targets: [txTo.toLowerCase()] };
}
