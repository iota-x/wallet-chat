import type { Chain, Mode } from "./types";

/**
 * Chain registry. `mode` is the tier (devnet = executable test tier, mainnet =
 * real & read-only). Each chain resolves that tier to a concrete network, an
 * RPC endpoint, a friendly display name, and its native asset.
 */

export interface ChainMeta {
  chain: Chain;
  label: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Whether swaps are supported on this chain in this app. */
  supportsSwap: boolean;
  /** Whether we run a real on-chain simulation + exact diff decode. */
  supportsSimulation: boolean;
}

export const CHAINS: Record<Chain, ChainMeta> = {
  solana: {
    chain: "solana",
    label: "Solana",
    nativeSymbol: "SOL",
    nativeDecimals: 9,
    supportsSwap: true,
    supportsSimulation: true,
  },
  ethereum: {
    chain: "ethereum",
    label: "Ethereum",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    supportsSwap: true,
    supportsSimulation: true,
  },
  bitcoin: {
    chain: "bitcoin",
    label: "Bitcoin",
    nativeSymbol: "BTC",
    nativeDecimals: 8,
    supportsSwap: false,
    supportsSimulation: false,
  },
};

/** Human network name for a chain + tier (for UI display). */
export function networkName(chain: Chain, mode: Mode): string {
  if (mode === "mainnet") {
    return { solana: "Mainnet Beta", ethereum: "Mainnet", bitcoin: "Mainnet" }[chain];
  }
  return { solana: "Devnet", ethereum: "Sepolia", bitcoin: "Testnet" }[chain];
}

/** EVM chain id for the active tier. */
export function evmChainId(mode: Mode): number {
  return mode === "mainnet" ? 1 : 11155111; // mainnet : sepolia
}

export function evmRpc(mode: Mode): string {
  if (mode === "mainnet") {
    return (
      process.env.NEXT_PUBLIC_ETH_MAINNET_RPC ||
      "https://ethereum-rpc.publicnode.com"
    );
  }
  return (
    process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC ||
    "https://ethereum-sepolia-rpc.publicnode.com"
  );
}

export function btcNetwork(mode: Mode): "mainnet" | "testnet" {
  return mode === "mainnet" ? "mainnet" : "testnet";
}

/** mempool.space API base for the active tier. */
export function btcApiBase(mode: Mode): string {
  return mode === "mainnet"
    ? "https://mempool.space/api"
    : "https://mempool.space/testnet4/api";
}
