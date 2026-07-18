"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import type { Mode } from "@/lib/types";
import { rpcEndpoint } from "@/lib/solana/constants";
import "@solana/wallet-adapter-react-ui/styles.css";

// @solana/web3.js expects a Buffer global in the browser.
if (typeof window !== "undefined") {
  const w = window as unknown as { Buffer?: typeof Buffer };
  if (!w.Buffer) w.Buffer = Buffer;
}

/** App-wide mode (devnet / mainnet). Drives both the RPC and the agent body. */
interface ModeCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
}
const ModeContext = createContext<ModeCtx | null>(null);

export function useMode(): ModeCtx {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within WalletProviders");
  return ctx;
}

const DEFAULT_MODE: Mode =
  (process.env.NEXT_PUBLIC_DEFAULT_MODE as Mode) === "mainnet"
    ? "mainnet"
    : "devnet";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const endpoint = useMemo(() => rpcEndpoint(mode), [mode]);

  // Empty adapter list → Wallet Standard auto-detection (Phantom, Solflare, …).
  const wallets = useMemo(() => [], []);

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ModeContext.Provider>
  );
}
