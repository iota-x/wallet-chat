"use client";

import React, { useEffect, useState } from "react";
import { useModalDismiss } from "./useModalDismiss";

const KEY = "wc-onboarded-v1";

const STEPS = [
  { k: "state", t: "State an intent", d: "Say what you want in plain language — “send half my USDC to mom”, “swap 0.1 SOL to USDC”." },
  { k: "read", t: "Read the slip", d: "It simulates against live chain state and prints the exact balance diff, fees, and every guardrail check." },
  { k: "sign", t: "Arm & sign", d: "Signing unlocks only after simulation passes and guardrails clear — and it happens in your wallet, never on a server." },
];

/** First-run explainer. Shows once per browser; dismissal is remembered. */
export function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }
  useModalDismiss(close);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30" onClick={close} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-paper2 shadow-2xl p-6 animate-fade-up">
        <span className="eyebrow">welcome · state intent · read the risk · then sign</span>
        <h2 className="text-[22px] font-semibold tracking-tight text-ink mt-1.5">
          See exactly what a transaction does before it happens.
        </h2>

        <ol className="mt-5 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.k} className="flex gap-3">
              <span className="shrink-0 h-6 w-6 grid place-items-center rounded-full border border-magenta/40 text-magenta font-mono text-[11px]">
                {i + 1}
              </span>
              <div>
                <div className="text-[13px] text-ink font-medium">{s.t}</div>
                <div className="text-[12px] text-ink2 leading-relaxed">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-[11px] text-ink3 leading-relaxed">
          Devnet / testnet execute end-to-end. Mainnet is read-only until you enable
          signing in guardrails. Connect a wallet (top-right) to begin — press ⌘K any
          time for the command menu.
        </p>

        <button
          onClick={close}
          className="mt-5 w-full rounded-lg bg-magenta text-paper font-mono text-[13px] py-2.5 hover:bg-ink transition-colors"
        >
          get started
        </button>
      </div>
    </div>
  );
}
