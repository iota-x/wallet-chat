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
import { PortfolioPanel } from "./PortfolioPanel";
import { AddressBookPanel } from "./AddressBookPanel";
import { SettingsPanel } from "./SettingsPanel";
import { Chat } from "./Chat";
import type { Chain, Mode } from "@/lib/types";
import { CHAINS, networkName } from "@/lib/chains";
import { shortAddr } from "@/lib/format";
import { getMainnetSigning, POLICY_EVENT } from "@/lib/policy-store";

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
  const [signingOn, setSigningOn] = useState(false);
  const [panel, setPanel] = useState<
    null | "portfolio" | "transactions" | "addresses" | "settings"
  >(null);

  const ctx = { chain, mode, owner: owner ?? null };

  // Sidebar open state persists (default: open on desktop, closed on mobile).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wc-sidebar");
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      setDrawer(saved != null ? saved === "1" : desktop);
    } catch {
      /* ignore */
    }
  }, []);
  function toggleDrawer(v: boolean) {
    setDrawer(v);
    try {
      localStorage.setItem("wc-sidebar", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  function closeOnMobile() {
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches) {
      setDrawer(false);
    }
  }

  // Reflect the mainnet-signing switch in the header status.
  useEffect(() => {
    const sync = () => setSigningOn(getMainnetSigning());
    sync();
    window.addEventListener(POLICY_EVENT, sync);
    return () => window.removeEventListener(POLICY_EVENT, sync);
  }, []);

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
    closeOnMobile();
  }
  function startNew() {
    convos.newChat(ctx);
    closeOnMobile();
  }

  const sidebar = (
    <ChatSidebar
      conversations={history}
      activeId={convos.activeId}
      onNew={startNew}
      onSelect={selectConversation}
      onDelete={convos.remove}
      onOpen={(p) => {
        setPanel(p);
        closeOnMobile();
      }}
    />
  );

  return (
    <div className="h-dvh flex overflow-hidden">
      {/* Desktop: a persistent push sidebar — content sits beside it, no dim. */}
      {drawer && (
        <aside className="hidden md:flex w-64 shrink-0 border-r border-line/70 flex-col bg-paper2/40">
          <SidebarBrand onClose={() => toggleDrawer(false)} />
          {sidebar}
        </aside>
      )}

      {/* Mobile: an overlay drawer (there's no room to push). */}
      {drawer && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-paper border-r border-line flex flex-col animate-fade-up">
            <SidebarBrand onClose={() => setDrawer(false)} />
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 border-b border-line/70 px-3 sm:px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => toggleDrawer(!drawer)}
                aria-label="Toggle conversations"
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
              <StatusReadout owner={owner} chain={chain} mode={mode} signingOn={signingOn} />
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
      </div>

      {panel === "portfolio" && <PortfolioPanel onClose={() => setPanel(null)} />}
      {panel === "transactions" && <TransactionsPanel onClose={() => setPanel(null)} />}
      {panel === "addresses" && <AddressBookPanel onClose={() => setPanel(null)} />}
      {panel === "settings" && <SettingsPanel onClose={() => setPanel(null)} />}
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
  signingOn,
}: {
  owner: string | null;
  chain: Chain;
  mode: Mode;
  signingOn: boolean;
}) {
  // devnet → live · mainnet+off → read-only · mainnet+on → signing (armed).
  const tier =
    mode === "mainnet"
      ? signingOn
        ? { label: "signing", cls: "border-neg/50 text-neg bg-neg/[0.06]" }
        : { label: "read-only", cls: "border-line text-ink3" }
      : { label: "live", cls: "border-magenta/30 text-magenta" };
  return (
    <div className="hidden sm:flex items-center gap-2 pr-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${owner ? "bg-magenta animate-blink" : "bg-ink3"}`}
      />
      <span className="num text-[11px] text-ink2">
        {owner ? shortAddr(owner, 4) : "no wallet"}
      </span>
      <span
        className={`eyebrow px-1.5 py-0.5 rounded border ${tier.cls}`}
        title={networkName(chain, mode)}
      >
        {tier.label}
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
