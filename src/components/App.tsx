"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useWalletChat } from "./WalletProviders";
import { Chat } from "./Chat";
import type { Chain, Mode } from "@/lib/types";
import { CHAINS, networkName } from "@/lib/chains";
import { shortAddr } from "@/lib/format";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export function App() {
  const { chain, setChain, mode, setMode } = useWalletChat();

  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto px-4">
      <header className="py-4 border-b border-hairline space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-accent/15 border border-accent/30 grid place-items-center">
              <span className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse-ring" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink tracking-tight">
                WalletChat
              </div>
              <div className="text-[10px] text-faint">simulate before you sign</div>
            </div>
          </div>
          <ConnectArea />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ChainSelector chain={chain} setChain={setChain} />
          <ModeToggle mode={mode} setMode={setMode} />
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <Chat />
      </main>

      <footer className="py-2 text-center">
        <p className="text-[10px] text-faint">
          {CHAINS[chain].label} {networkName(chain, mode)} ·{" "}
          {mode === "devnet"
            ? "executes end-to-end after your confirmation"
            : "read-only: real reads, plans & sims, signing disabled"}
        </p>
      </footer>
    </div>
  );
}

function ConnectArea() {
  const { chain, evmAddress, connectEvm, btcAddress, connectBtc } = useWalletChat();

  if (chain === "solana") {
    return (
      <WalletMultiButton
        style={{
          height: 36,
          fontSize: 13,
          borderRadius: 10,
          backgroundColor: "#14171e",
          border: "1px solid #20242e",
          paddingInline: 12,
        }}
      />
    );
  }

  const addr = chain === "ethereum" ? evmAddress : btcAddress;
  const onClick = chain === "ethereum" ? connectEvm : connectBtc;
  const label =
    chain === "ethereum" ? "Connect MetaMask" : "Connect Unisat";

  return (
    <button
      onClick={() => onClick().catch((e) => alert(e.message))}
      className="h-9 rounded-[10px] bg-raised border border-hairline px-3 text-[13px] text-ink hover:border-accent transition-colors num"
    >
      {addr ? shortAddr(addr, 5) : label}
    </button>
  );
}

function ChainSelector({
  chain,
  setChain,
}: {
  chain: Chain;
  setChain: (c: Chain) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Chain"
      className="inline-flex rounded-lg border border-hairline bg-surface p-0.5 text-xs"
    >
      {(Object.keys(CHAINS) as Chain[]).map((c) => {
        const active = chain === c;
        return (
          <button
            key={c}
            role="tab"
            aria-selected={active}
            onClick={() => setChain(c)}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              active ? "bg-raised text-ink" : "text-faint hover:text-muted"
            }`}
          >
            {CHAINS[c].label}
          </button>
        );
      })}
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const { chain } = useWalletChat();
  return (
    <div
      role="tablist"
      aria-label="Network tier"
      className="inline-flex rounded-lg border border-hairline bg-surface p-0.5 text-xs"
    >
      {(["devnet", "mainnet"] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(m)}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              active ? "bg-raised text-ink" : "text-faint hover:text-muted"
            }`}
            title={networkName(chain, m)}
          >
            {networkName(chain, m)}
          </button>
        );
      })}
    </div>
  );
}
