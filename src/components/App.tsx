"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useMode } from "./WalletProviders";
import { Chat } from "./Chat";
import type { Mode } from "@/lib/types";

// Wallet button touches window on mount — load it client-only to avoid hydration mismatch.
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (m) => m.WalletMultiButton
    ),
  { ssr: false }
);

export function App() {
  const { mode, setMode } = useMode();

  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto px-4">
      <header className="flex items-center justify-between gap-3 py-4 border-b border-hairline">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-accent/15 border border-accent/30 grid place-items-center">
            <span className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse-ring" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink tracking-tight">
              WalletChat
            </div>
            <div className="text-[10px] text-faint">
              simulate before you sign
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} setMode={setMode} />
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
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <Chat />
      </main>

      <footer className="py-2 text-center">
        <p className="text-[10px] text-faint">
          {mode === "devnet"
            ? "Devnet · executes end-to-end after your confirmation"
            : "Mainnet · read-only: real reads, plans & sims, signing disabled"}
        </p>
      </footer>
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
  return (
    <div
      role="tablist"
      aria-label="Network mode"
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
              active
                ? "bg-raised text-ink"
                : "text-faint hover:text-muted"
            }`}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}
