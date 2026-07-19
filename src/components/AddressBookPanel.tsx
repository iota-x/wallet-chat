"use client";

import React, { useEffect, useState } from "react";
import { useWalletChat } from "./WalletProviders";
import { CHAINS } from "@/lib/chains";
import { shortAddr } from "@/lib/format";
import {
  listEntries,
  addEntry,
  removeEntry,
  type AddressEntry,
} from "@/lib/address-book";

export function AddressBookPanel({ onClose }: { onClose: () => void }) {
  const { chain } = useWalletChat();
  const [entries, setEntries] = useState<AddressEntry[]>([]);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => setEntries(listEntries()), []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !address.trim()) return;
    addEntry({ label, address, chain });
    setEntries(listEntries());
    setLabel("");
    setAddress("");
  }
  function del(id: string) {
    removeEntry(id);
    setEntries(listEntries());
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[82vh] flex flex-col rounded-2xl border border-line bg-paper2 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/70">
          <div>
            <span className="eyebrow">address book</span>
            <div className="text-[13px] text-ink font-medium mt-0.5">
              saved recipients
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 grid place-items-center rounded-lg border border-line text-ink2 hover:border-magenta"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="px-4 py-3 border-b border-line/70 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-label rounded px-1.5 py-0.5 border border-magenta/40 text-magenta shrink-0">
              {CHAINS[chain].nativeSymbol}
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="label (e.g. mom)"
              className="flex-1 min-w-0 rounded-lg bg-paper border border-line px-3 py-2 text-sm focus:border-magenta"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={`${CHAINS[chain].label} address`}
              className="flex-1 min-w-0 rounded-lg bg-paper border border-line px-3 py-2 text-sm num focus:border-magenta"
            />
            <button
              type="submit"
              disabled={!label.trim() || !address.trim()}
              className="shrink-0 rounded-lg bg-magenta text-paper font-mono text-[12px] px-4 py-2 hover:bg-ink transition-colors disabled:bg-haze disabled:text-ink3"
            >
              add
            </button>
          </div>
          <p className="text-[11px] text-ink3">
            The agent uses these when you say “send to {label.trim() || "a label"}”.
          </p>
        </form>

        <div className="overflow-y-auto p-2">
          {entries.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-ink3">
              No saved addresses yet.
            </p>
          )}
          {entries.map((en) => (
            <div key={en.id} className="group flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-haze">
              <span className="font-mono text-[8px] uppercase tracking-label rounded px-1 py-0.5 border border-line text-ink3 shrink-0">
                {CHAINS[en.chain].nativeSymbol}
              </span>
              <span className="text-[13px] text-ink font-medium">{en.label}</span>
              <span className="flex-1" />
              <span className="num text-[11px] text-ink3">{shortAddr(en.address, 6)}</span>
              <button
                onClick={() => del(en.id)}
                aria-label="Delete"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-ink3 hover:text-neg font-mono text-xs w-4 h-4 grid place-items-center transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
