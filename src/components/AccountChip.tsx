"use client";

import React, { useEffect, useRef, useState } from "react";
import { useWalletChat } from "./WalletProviders";
import { shortAddr } from "@/lib/format";
import { evmChainId, networkName } from "@/lib/chains";
import { getEvmChainId, switchEvmChain, getEthereum } from "@/lib/wallet/evm";
import { reverseEnsName } from "@/lib/names/resolve";
import { notify } from "@/lib/toast";
import { CopyButton } from "./CopyButton";

/** Connected-account chip: address (or ENS name), copy, disconnect, and — for
 * Ethereum — a live network indicator that flags a wallet/tier mismatch. */
export function AccountChip({ chain }: { chain: "ethereum" | "bitcoin" }) {
  const { evmAddress, btcAddress, disconnectEvm, disconnectBtc, mode } = useWalletChat();
  const address = chain === "ethereum" ? evmAddress : btcAddress;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(null);
    if (chain === "ethereum" && address) reverseEnsName(address).then(setName);
  }, [chain, address]);

  useEffect(() => {
    if (chain !== "ethereum") return;
    getEvmChainId().then(setChainId);
    const eth = getEthereum();
    eth?.on?.("chainChanged", (...a: unknown[]) => setChainId(parseInt(a[0] as string, 16)));
  }, [chain, address]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!address) return null;
  const expected = chain === "ethereum" ? evmChainId(mode) : null;
  const mismatch =
    chain === "ethereum" && chainId != null && expected != null && chainId !== expected;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-9 flex items-center gap-2 rounded-lg bg-haze border border-line px-2.5 text-[12px] font-mono text-ink hover:border-magenta transition-colors"
      >
        {mismatch && (
          <span className="h-1.5 w-1.5 rounded-full bg-warn" title="wrong network" />
        )}
        <span className="max-w-[10rem] truncate">{name ?? shortAddr(address, 4)}</span>
        <span className="text-ink3 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-line bg-paper2 shadow-2xl p-3 animate-fade-up">
          <span className="eyebrow">{chain === "ethereum" ? "ethereum" : "bitcoin"} account</span>
          {name && <div className="text-[13px] text-ink font-medium mt-1">{name}</div>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="num text-[11px] text-ink2 break-all flex-1">{address}</span>
            <CopyButton value={address} label="address" />
          </div>

          {chain === "ethereum" && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink3">network</span>
              {mismatch ? (
                <button
                  onClick={async () => {
                    try {
                      await switchEvmChain(mode);
                      notify("Network switched", "success");
                    } catch (e) {
                      notify((e as Error).message, "error");
                    }
                  }}
                  className="font-mono text-[11px] text-warn hover:text-ink border border-warn/40 rounded px-2 py-0.5 transition-colors"
                >
                  switch to {networkName("ethereum", mode)}
                </button>
              ) : (
                <span className="font-mono text-[11px] text-pos">
                  {networkName("ethereum", mode)}
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => {
              chain === "ethereum" ? disconnectEvm() : disconnectBtc();
              setOpen(false);
              notify("Wallet disconnected", "info");
            }}
            className="mt-3 w-full rounded-lg border border-line text-ink2 hover:border-neg hover:text-neg font-mono text-[11px] py-1.5 transition-colors"
          >
            disconnect
          </button>
        </div>
      )}
    </div>
  );
}
