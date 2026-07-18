"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletChat } from "./WalletProviders";

/** The connected address for the active chain, or null. */
export function useActiveOwner(): string | null {
  const { chain, evmAddress, btcAddress } = useWalletChat();
  const { publicKey } = useWallet();
  if (chain === "ethereum") return evmAddress;
  if (chain === "bitcoin") return btcAddress;
  return publicKey?.toBase58() ?? null;
}
