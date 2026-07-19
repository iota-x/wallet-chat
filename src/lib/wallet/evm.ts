import { numberToHex } from "viem";
import type { EvmTxRequest, Mode } from "@/lib/types";
import { evmChainId } from "@/lib/chains";

/** Thin EIP-1193 (MetaMask) helpers for the client. */

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
}

export function getEthereum(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

export async function connectEvm(): Promise<string | null> {
  const eth = getEthereum();
  if (!eth) throw new Error("No Ethereum wallet found. Install MetaMask.");
  const accts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  return accts?.[0] ?? null;
}

export async function getEvmAccount(): Promise<string | null> {
  const eth = getEthereum();
  if (!eth) return null;
  const accts = (await eth.request({ method: "eth_accounts" })) as string[];
  return accts?.[0] ?? null;
}

/** The wallet's currently-selected chain id, or null if unavailable. */
export async function getEvmChainId(): Promise<number | null> {
  const eth = getEthereum();
  if (!eth) return null;
  try {
    const hex = (await eth.request({ method: "eth_chainId" })) as string;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

/** Ask the wallet to switch to the tier's chain (mainnet or Sepolia). */
export async function switchEvmChain(mode: Mode): Promise<void> {
  const eth = getEthereum();
  if (!eth) throw new Error("No Ethereum wallet.");
  await eth.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: numberToHex(evmChainId(mode)) }],
  });
}

async function ensureChain(mode: Mode): Promise<void> {
  const eth = getEthereum();
  if (!eth) throw new Error("No Ethereum wallet.");
  const target = numberToHex(evmChainId(mode));
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target }],
    });
  } catch (e) {
    // 4902 = chain not added. Sepolia/mainnet are usually present; rethrow otherwise.
    throw new Error(
      `Switch your wallet to ${mode === "mainnet" ? "Ethereum Mainnet" : "Sepolia"} (${(e as Error).message}).`
    );
  }
}

/** Sign + submit an EVM tx via the wallet. Returns the tx hash. */
export async function sendEvmTx(tx: EvmTxRequest, mode: Mode): Promise<string> {
  const eth = getEthereum();
  if (!eth) throw new Error("No Ethereum wallet.");
  await ensureChain(mode);
  const hash = (await eth.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: numberToHex(BigInt(tx.value)),
        gas: numberToHex(BigInt(tx.gas)),
        maxFeePerGas: numberToHex(BigInt(tx.maxFeePerGas)),
        maxPriorityFeePerGas: numberToHex(BigInt(tx.maxPriorityFeePerGas)),
      },
    ],
  })) as string;
  return hash;
}
