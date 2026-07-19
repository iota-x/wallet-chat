"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useWalletChat } from "./WalletProviders";
import { useActiveOwner } from "./wallet-hooks";
import { useConversations } from "./useConversations";
import { ThemeToggle } from "./ThemeToggle";
import { ChatSidebar } from "./ChatSidebar";
import { TransactionsPanel } from "./TransactionsPanel";
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
  const convos = useConversations();
  const [drawer, setDrawer] = useState(false);
  const [txOpen, setTxOpen] = useState(false);

  const ctx = { chain, mode, owner: owner ?? null };

  // Ensure there's an active chat once history has hydrated.
  useEffect(() => {
    if (convos.hydrated && !convos.activeId) convos.newChat(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convos.hydrated, convos.activeId]);

  // When the active conversation changes (load / switch), restore its chain +
  // tier so the agent context matches. Empty new chats keep the current context.
  useEffect(() => {
    const c = convos.active;
    if (c && c.messages.length > 0) {
      setChain(c.chain);
      setMode(c.mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convos.activeId]);

  const history = convos.conversations.filter((c) => c.messages.length > 0);

  function selectConversation(id: string) {
    convos.select(id);
    setDrawer(false);
  }
  function startNew() {
    convos.newChat(ctx);
    setDrawer(false);
  }

  return (
    <div className="h-dvh flex flex-col">
      <header className="shrink-0 border-b border-line/70 px-3 sm:px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setDrawer(true)}
              aria-label="Open conversations"
              className="h-8 w-8 grid place-items-center rounded-lg border border-line text-ink2 hover:border-magenta hover:text-ink transition-colors"
            >
              ☰
            </button>
            <Link href="/" className="hidden sm:flex items-center gap-2 group">
              <GlassMark />
              <span className="font-mono text-[13px] text-ink group-hover:text-magenta transition-colors">
                walletchat
              </span>
            </Link>
            <span className="hidden md:block h-4 w-px bg-line" />
            <div className="flex items-center gap-2 flex-wrap">
              <ChainSelector chain={chain} setChain={setChain} />
              <span className="h-4 w-px bg-line hidden sm:block" />
              <ModeToggle mode={mode} setMode={setMode} chain={chain} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusReadout owner={owner} chain={chain} mode={mode} />
            <ThemeToggle />
            <ConnectArea />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 px-4">
        <div className="max-w-2xl mx-auto h-full">
          {convos.active ? (
            <Chat
              key={convos.active.id}
              conversation={convos.active}
              onSave={convos.saveMessages}
            />
          ) : null}
        </div>
      </main>

      {/* Toggle-able conversation drawer (closed on load — chat only). */}
      {drawer && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setDrawer(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-paper border-r border-line flex flex-col animate-fade-up">
            <SidebarBrand onClose={() => setDrawer(false)} />
            <ChatSidebar
              conversations={history}
              activeId={convos.activeId}
              onNew={startNew}
              onSelect={selectConversation}
              onDelete={convos.remove}
              onOpenTransactions={() => {
                setTxOpen(true);
                setDrawer(false);
              }}
            />
          </aside>
        </div>
      )}

      {txOpen && <TransactionsPanel onClose={() => setTxOpen(false)} />}
    </div>
  );
}

function SidebarBrand({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-4 border-b border-line/70">
      <Link href="/" className="flex items-center gap-2.5 group">
        <GlassMark />
        <div className="leading-none">
          <div className="font-mono text-[13px] font-medium tracking-tight text-ink group-hover:text-magenta transition-colors">
            walletchat
          </div>
          <div className="eyebrow mt-1.5">transaction verifier</div>
        </div>
      </Link>
      <button
        onClick={onClose}
        aria-label="Close"
        className="h-7 w-7 grid place-items-center rounded-lg text-ink3 hover:text-ink transition-colors"
      >
        ✕
      </button>
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
    <div className="hidden sm:flex items-center gap-2 pr-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${owner ? "bg-magenta animate-blink" : "bg-ink3"}`}
      />
      <span className="num text-[11px] text-ink2">
        {owner ? shortAddr(owner, 4) : "no wallet"}
      </span>
      <span
        className={`eyebrow px-1.5 py-0.5 rounded border ${
          mode === "mainnet" ? "border-neg/40 text-neg" : "border-magenta/30 text-magenta"
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
              active
                ? "bg-haze text-ink border border-line"
                : "text-ink3 hover:text-ink2 border border-transparent"
            }`}
          >
            {networkName(chain, m)}
          </button>
        );
      })}
    </div>
  );
}
