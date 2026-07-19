import { PublicKey } from "@solana/web3.js";
import type { Mode } from "@/lib/types";

/** Native SOL sentinel — not a real SPL mint, used for routing/pricing lookups. */
export const NATIVE_SOL = "So11111111111111111111111111111111111111112"; // wSOL mint
export const SOL_DECIMALS = 9;
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Rent-exempt minimum for a 165-byte SPL token account (lamports). Constant on
 * Solana today; we also read it live where correctness demands it. */
export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
export const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111"
);
export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
export const JUPITER_V6_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
);

/** A curated token registry. Symbol/decimals must be exact — the diff decode
 * relies on decimals being right. USD prices are fetched live at plan time. */
export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
  /** Per-mode addresses. Some tokens only exist meaningfully on mainnet. */
  mints: Partial<Record<Mode, string>>;
  /** CoinGecko-independent price key (Jupiter price API uses mints directly). */
  coingeckoId?: string;
}

export const TOKENS: Record<string, TokenMeta> = {
  SOL: {
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    mints: { devnet: NATIVE_SOL, mainnet: NATIVE_SOL },
    coingeckoId: "solana",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    mints: {
      // Circle's devnet USDC (Jupiter/most faucets use this) and mainnet USDC.
      devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJg8Jm2mm5",
      mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    },
    coingeckoId: "usd-coin",
  },
  JitoSOL: {
    symbol: "JitoSOL",
    name: "Jito Staked SOL",
    decimals: 9,
    mints: {
      // JitoSOL is a mainnet asset; devnet has no canonical JitoSOL, so swaps
      // targeting it are a mainnet (read-only) scenario. See DECISION_LOG 1.1.
      mainnet: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    },
    coingeckoId: "jito-staked-sol",
  },
  USDT: {
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    mints: { mainnet: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
    coingeckoId: "tether",
  },
  BONK: {
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    mints: { mainnet: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    coingeckoId: "bonk",
  },
};

/** Reverse lookup: mint address (for a given mode) → token meta. */
export function tokenByMint(mint: string, mode: Mode): TokenMeta | null {
  for (const meta of Object.values(TOKENS)) {
    if (meta.mints[mode] === mint) return meta;
  }
  return null;
}

export function tokenBySymbol(symbol: string): TokenMeta | null {
  const key = Object.keys(TOKENS).find(
    (k) => k.toLowerCase() === symbol.toLowerCase()
  );
  return key ? TOKENS[key] : null;
}

export function rpcEndpoint(mode: Mode): string {
  if (mode === "mainnet") {
    return process.env.NEXT_PUBLIC_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
  }
  return process.env.NEXT_PUBLIC_DEVNET_RPC || "https://api.devnet.solana.com";
}

/** Whether real signing/submission is permitted. The executable test tier
 * (devnet/Sepolia/testnet) always allows it. Mainnet is read-only by default —
 * reads, plans, sims and the real diff, but no broadcast — unless the user has
 * explicitly opted into mainnet signing (`allowMainnet`), accepting real-fund
 * risk. The value is threaded from the request, never trusted from the model. */
export function modeAllowsSigning(mode: Mode, allowMainnet = false): boolean {
  return mode === "devnet" || (mode === "mainnet" && allowMainnet);
}
