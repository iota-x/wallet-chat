"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useWalletChat } from "./WalletProviders";
import { useActiveOwner } from "./wallet-hooks";
import { ThemeToggle } from "./ThemeToggle";
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
  const owner = useActiveOwner();

  return (
    <div className="h-dvh flex flex-col max-w-2xl mx-auto px-4">
      <header className="pt-5 pb-3 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <GlassMark />
            <div className="leading-none">
              <div className="font-mono text-[14px] font-medium tracking-tight text-ink group-hover:text-magenta transition-colors">
                walletchat
              </div>
              <div className="eyebrow mt-1.5">transaction verifier</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectArea />
          </div>
        </div>

        {/* Instrument status rail. */}
        <div className="mt-4 rounded-xl border border-line bg-paper2/70 px-2 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ChainSelector chain={chain} setChain={setChain} />
            <span className="h-4 w-px bg-line hidden sm:block" />
            <ModeToggle mode={mode} setMode={setMode} chain={chain} />
          </div>
          <StatusReadout owner={owner} chain={chain} mode={mode} />
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <Chat />
      </main>

      <footer className="py-2.5 shrink-0">
        <p className="eyebrow text-center">
          simulate · guardrail · sign — {CHAINS[chain].label} {networkName(chain, mode)}
        </p>
      </footer>
    </div>
  );
}

function GlassMark() {
  return (
    <span
      className="h-7 w-7 rounded-[8px] shrink-0"
      style={{
        background:
          "conic-gradient(from 210deg, #C7B8F0, #8E97E8, #EBB2E4, #E6A15C, #C7B8F0)",
        boxShadow: "inset 0 0 6px rgba(255,255,255,0.6)",
      }}
      aria-hidden
    />
  );
}

function StatusReadout({
  owner,
  chain,
  mode,
}: {
  owner: string | null;
  chain: Chain;
  mode: Mode;
}) {
  return (
    <div className="flex items-center gap-2 pr-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          owner ? "bg-magenta animate-blink" : "bg-ink3"
        }`}
      />
      <span className="num text-[11px] text-ink2">
        {owner ? shortAddr(owner, 4) : "no wallet"}
      </span>
      <span
        className={`eyebrow px-1.5 py-0.5 rounded border ${
          mode === "mainnet"
            ? "border-neg/40 text-neg"
            : "border-magenta/30 text-magenta"
        }`}
        title={networkName(chain, mode)}
      >
        {mode === "mainnet" ? "read-only" : "live"}
      </span>
    </div>
  );
}

function ConnectArea() {
  const { chain, evmAddress, connectEvm, btcAddress, connectBtc } = useWalletChat();

  if (chain === "solana") {
    return <WalletMultiButton />;
  }

  const addr = chain === "ethereum" ? evmAddress : btcAddress;
  const onClick = chain === "ethereum" ? connectEvm : connectBtc;
  const label = chain === "ethereum" ? "Connect MetaMask" : "Connect Unisat";

  return (
    <button
      onClick={() => onClick().catch((e) => alert(e.message))}
      className="h-9 rounded-lg bg-haze border border-line px-3 text-[12px] font-mono text-ink hover:border-magenta transition-colors"
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
    <div role="tablist" aria-label="Chain" className="inline-flex gap-0.5">
      {(Object.keys(CHAINS) as Chain[]).map((c) => {
        const active = chain === c;
        return (
          <button
            key={c}
            role="tab"
            aria-selected={active}
            onClick={() => setChain(c)}
            className={`font-mono text-[11px] px-2.5 py-1.5 rounded-md transition-colors ${
              active
                ? "bg-haze text-magenta border border-magenta/30"
                : "text-ink3 hover:text-ink2 border border-transparent"
            }`}
          >
            {CHAINS[c].nativeSymbol}
          </button>
        );
      })}
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
  chain,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  chain: Chain;
}) {
  return (
    <div role="tablist" aria-label="Network tier" className="inline-flex gap-0.5">
      {(["devnet", "mainnet"] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(m)}
            className={`font-mono text-[11px] px-2 py-1.5 rounded-md transition-colors ${
              active ? "bg-haze text-ink border border-line" : "text-ink3 hover:text-ink2 border border-transparent"
            }`}
          >
            {networkName(chain, m)}
          </button>
        );
      })}
    </div>
  );
}
