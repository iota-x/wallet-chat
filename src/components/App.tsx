"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useWalletChat } from "./WalletProviders";
import { useActiveOwner } from "./wallet-hooks";
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
          <div className="flex items-center gap-3">
            <InstrumentMark />
            <div className="leading-none">
              <div className="font-mono text-[15px] font-semibold tracking-[0.02em] text-text-hi">
                WALLETCHAT
              </div>
              <div className="eyebrow mt-1.5">transaction verifier</div>
            </div>
          </div>
          <ConnectArea />
        </div>

        {/* Instrument status rail. */}
        <div className="mt-4 rounded-xl border border-hairline bg-surface/70 px-2 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ChainSelector chain={chain} setChain={setChain} />
            <span className="h-4 w-px bg-hairline hidden sm:block" />
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

function InstrumentMark() {
  return (
    <div className="h-9 w-9 rounded-lg border border-gold/35 bg-gold/[0.07] grid place-items-center relative overflow-hidden">
      <div className="absolute inset-x-1.5 top-2 h-px bg-gold/25" />
      <div className="absolute inset-x-1.5 bottom-2 h-px bg-gold/15" />
      <span className="font-mono text-gold text-[13px] leading-none">₩</span>
    </div>
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
          owner ? "bg-gold animate-blink" : "bg-text-lo"
        }`}
      />
      <span className="num text-[11px] text-text-mid">
        {owner ? shortAddr(owner, 4) : "no wallet"}
      </span>
      <span
        className={`eyebrow px-1.5 py-0.5 rounded border ${
          mode === "mainnet"
            ? "border-neg/40 text-neg"
            : "border-gold/30 text-gold"
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
      className="h-9 rounded-lg bg-panel border border-hairline px-3 text-[12px] font-mono text-text-hi hover:border-gold transition-colors"
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
                ? "bg-panel text-gold border border-gold/30"
                : "text-text-lo hover:text-text-mid border border-transparent"
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
              active ? "bg-panel text-text-hi border border-hairline" : "text-text-lo hover:text-text-mid border border-transparent"
            }`}
          >
            {networkName(chain, m)}
          </button>
        );
      })}
    </div>
  );
}
