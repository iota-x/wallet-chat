import type { Mode } from "@/lib/types";

/** Native ETH placeholder used by aggregators (0x/1inch convention). */
export const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Multicall3 — same address on Ethereum, Sepolia, and most EVM chains. */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export const MULTICALL3_ABI = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

export interface EvmTokenMeta {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Partial<Record<Mode, string>>;
}

/** Curated ERC-20 registry. Addresses are checksummed; decimals must be exact. */
export const EVM_TOKENS: Record<string, EvmTokenMeta> = {
  ETH: {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    addresses: { mainnet: NATIVE_ETH, devnet: NATIVE_ETH },
  },
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    addresses: {
      mainnet: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      devnet: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
    },
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    addresses: {
      mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      devnet: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Circle Sepolia USDC
    },
  },
  USDT: {
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    addresses: { mainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  },
  DAI: {
    symbol: "DAI",
    name: "Dai",
    decimals: 18,
    addresses: { mainnet: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
  },
  WBTC: {
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    addresses: { mainnet: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
  },
};

/** Known spender contracts the app itself may cause approvals to (DEX routers).
 * Also the set the allowance viewer checks curated tokens against. */
export const KNOWN_SPENDERS: { address: string; label: string }[] = [
  { address: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", label: "KyberSwap router" },
];

export function evmTokenBySymbol(symbol: string): EvmTokenMeta | null {
  const key = Object.keys(EVM_TOKENS).find(
    (k) => k.toLowerCase() === symbol.toLowerCase()
  );
  return key ? EVM_TOKENS[key] : null;
}

export function evmTokenByAddress(addr: string, mode: Mode): EvmTokenMeta | null {
  const lower = addr.toLowerCase();
  for (const meta of Object.values(EVM_TOKENS)) {
    if (meta.addresses[mode]?.toLowerCase() === lower) return meta;
  }
  return null;
}

export function isNativeEth(addr: string): boolean {
  return addr.toLowerCase() === NATIVE_ETH.toLowerCase();
}
