"use client";

import React from "react";

const GUARANTEES = [
  {
    k: "read · plan · simulate only",
    d: "The app can read balances, draft a plan, and simulate it. It has no ability to submit a transaction — connecting a wallet does not grant a spend approval.",
  },
  {
    k: "keys never leave your wallet",
    d: "Signing happens inside your own wallet extension. The server holds no key and has no submit path — it never sees a secret.",
  },
  {
    k: "you sign every transfer, once",
    d: "Nothing moves until you read the exact diff and click. Mainnet stays read-only until you explicitly arm signing in guardrails.",
  },
];

/** Shown where the hesitation actually happens — before a wallet is connected —
 * to rebut "I'd never auth a random app to make transfers": it can't. */
export function TrustCard() {
  return (
    <div className="rounded-xl border border-line/70 bg-paper2/50 p-4">
      <span className="eyebrow">before you connect</span>
      <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight text-ink leading-snug">
        This app can&apos;t move your money.
      </h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink2">
        Connecting is read-only. Every transfer is simulated, shown to you in full, and signed
        by you — never by us.
      </p>

      <ul className="mt-4 space-y-3">
        {GUARANTEES.map((g) => (
          <li key={g.k} className="flex gap-2.5">
            <span
              className="shrink-0 mt-0.5 font-mono text-[11px] text-pos"
              aria-hidden
            >
              ✓
            </span>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-label text-ink">{g.k}</div>
              <div className="text-[12px] leading-relaxed text-ink2 mt-0.5">{g.d}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
