"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import type { Chain, Mode } from "@/lib/types";
import { rpcEndpoint } from "@/lib/solana/constants";
import {
  connectEvm as evmConnect,
  getEvmAccount,
  getEthereum,
} from "@/lib/wallet/evm";
import {
  connectBtc as btcConnect,
  getBtcAccount,
  getBtcPublicKey,
} from "@/lib/wallet/btc";
import "@solana/wallet-adapter-react-ui/styles.css";

// @solana/web3.js expects a Buffer global in the browser.
if (typeof window !== "undefined") {
  const w = window as unknown as { Buffer?: typeof Buffer };
  if (!w.Buffer) w.Buffer = Buffer;
}

interface WalletChatCtx {
  chain: Chain;
  setChain: (c: Chain) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  evmAddress: string | null;
  connectEvm: () => Promise<void>;
  disconnectEvm: () => void;
  btcAddress: string | null;
  btcPublicKey: string | null;
  connectBtc: () => Promise<void>;
  disconnectBtc: () => void;
}

const Ctx = createContext<WalletChatCtx | null>(null);

export function useWalletChat(): WalletChatCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWalletChat must be used within WalletProviders");
  return ctx;
}

const DEFAULT_MODE: Mode =
  (process.env.NEXT_PUBLIC_DEFAULT_MODE as Mode) === "mainnet"
    ? "mainnet"
    : "devnet";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const [chain, setChain] = useState<Chain>("solana");
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [btcPublicKey, setBtcPublicKey] = useState<string | null>(null);

  // Solana connection follows the tier; only used when chain === "solana".
  const endpoint = useMemo(() => rpcEndpoint(mode), [mode]);
  const wallets = useMemo(() => [], []);

  const connectEvm = useCallback(async () => {
    const a = await evmConnect();
    setEvmAddress(a);
  }, []);
  const connectBtc = useCallback(async () => {
    const a = await btcConnect();
    setBtcAddress(a);
    setBtcPublicKey(await getBtcPublicKey());
  }, []);
  // MetaMask/Unisat have no programmatic disconnect; we drop our local session
  // (the app forgets the account until the user reconnects).
  const disconnectEvm = useCallback(() => setEvmAddress(null), []);
  const disconnectBtc = useCallback(() => {
    setBtcAddress(null);
    setBtcPublicKey(null);
  }, []);

  // Re-hydrate already-authorized EVM/BTC accounts + watch for account changes.
  useEffect(() => {
    getEvmAccount().then((a) => a && setEvmAddress(a));
    getBtcAccount().then((a) => {
      if (a) {
        setBtcAddress(a);
        getBtcPublicKey().then((pk) => pk && setBtcPublicKey(pk));
      }
    });
    const eth = getEthereum();
    eth?.on?.("accountsChanged", (...args: unknown[]) => {
      const accts = args[0] as string[];
      setEvmAddress(accts?.[0] ?? null);
    });
  }, []);

  const value: WalletChatCtx = {
    chain,
    setChain,
    mode,
    setMode,
    evmAddress,
    connectEvm,
    disconnectEvm,
    btcAddress,
    btcPublicKey,
    connectBtc,
    disconnectBtc,
  };

  return (
    <Ctx.Provider value={value}>
      <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </Ctx.Provider>
  );
}
