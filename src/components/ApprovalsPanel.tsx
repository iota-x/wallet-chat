"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { Plan } from "@/lib/types";
import type { Allowance } from "@/lib/evm/allowances";
import { useWalletChat } from "./WalletProviders";
import { PlanPreview } from "./PlanPreview";
import { shortAddr, formatUi } from "@/lib/format";
import { getMainnetSigning, getPolicyOverride } from "@/lib/policy-store";

/**
 * Allowance viewer — see standing ERC-20 approvals and revoke the risky ones.
 * A revoke is not signed here: it is built as an approve(spender, 0) that flows
 * through the same simulate → guardrail → confirm slip as any other plan.
 */
export function ApprovalsPanel({ onClose }: { onClose: () => void }) {
  const { chain, mode, evmAddress } = useWalletChat();
  const [state, setState] = useState<
    | { s: "idle" }
    | { s: "loading" }
    | { s: "ready"; list: Allowance[] }
    | { s: "error"; msg: string }
  >({ s: "idle" });
  const [revoking, setRevoking] = useState<{ plan: Plan } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (chain !== "ethereum" || !evmAddress) return;
    setState({ s: "loading" });
    try {
      const res = await fetch(
        `/api/allowances?owner=${evmAddress}&mode=${mode}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as { allowances?: Allowance[]; error?: string };
      if (!res.ok || !data.allowances) throw new Error(data.error ?? "Failed to load.");
      setState({ s: "ready", list: data.allowances });
    } catch (e) {
      setState({ s: "error", msg: (e as Error).message });
    }
  }, [chain, mode, evmAddress]);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(a: Allowance) {
    const key = a.token.address + a.spender;
    setBusyKey(key);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          owner: evmAddress,
          token: a.token.address,
          spender: a.spender,
          amount: "0",
          allowMainnetSign: getMainnetSigning(),
          policyOverride: getPolicyOverride(),
        }),
      });
      const data = (await res.json()) as { plan?: Plan; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "Could not build revoke.");
      setRevoking({ plan: data.plan });
    } catch (e) {
      setState({ s: "error", msg: (e as Error).message });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[82vh] flex flex-col rounded-2xl border border-line bg-paper2 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/70">
          <div>
            <span className="eyebrow">token approvals</span>
            <div className="text-[13px] text-ink font-medium mt-0.5">
              standing allowances · Ethereum
            </div>
          </div>
          <div className="flex items-center gap-2">
            {state.s === "ready" && (
              <button
                onClick={load}
                className="font-mono text-[11px] text-ink3 hover:text-ink transition-colors"
              >
                refresh
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-7 w-7 grid place-items-center rounded-lg border border-line text-ink2 hover:border-magenta"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {chain !== "ethereum" && (
            <Note>Switch to Ethereum to view its token approvals.</Note>
          )}
          {chain === "ethereum" && !evmAddress && (
            <Note>Connect MetaMask to view your approvals.</Note>
          )}
          {state.s === "loading" && <Note>Reading allowances…</Note>}
          {state.s === "error" && (
            <Note tone="neg">{state.msg}</Note>
          )}
          {state.s === "ready" && state.list.length === 0 && (
            <Note tone="pos">
              No standing allowances to the known routers — nothing to revoke.
            </Note>
          )}
          {state.s === "ready" &&
            state.list.map((a) => {
              const key = a.token.address + a.spender;
              const amount = a.unlimited
                ? "unlimited"
                : `${formatUi(Number(a.amount) / 10 ** a.token.decimals)} ${a.token.symbol}`;
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    a.unlimited ? "border-neg/35 bg-neg/[0.05]" : "border-line"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-ink font-medium">{a.token.symbol}</span>
                      <span
                        className={`font-mono text-[9px] uppercase tracking-label rounded px-1.5 py-0.5 border ${
                          a.unlimited ? "border-neg/40 text-neg" : "border-line text-ink3"
                        }`}
                      >
                        {amount}
                      </span>
                    </div>
                    <div className="num text-[11px] text-ink3 mt-0.5">
                      → {a.spenderLabel ?? "spender"} · {shortAddr(a.spender, 6)}
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(a)}
                    disabled={busyKey === key}
                    className="shrink-0 rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] text-ink2 hover:border-neg hover:text-neg transition-colors disabled:opacity-50"
                  >
                    {busyKey === key ? "building…" : "revoke"}
                  </button>
                </div>
              );
            })}

          {state.s === "ready" && (
            <p className="text-[11px] text-ink3 leading-relaxed px-1 pt-1">
              Shows allowances to the routers this app can approve. Allowances granted
              elsewhere to arbitrary spenders need a full indexer and aren’t listed here.
            </p>
          )}
        </div>
      </div>

      {revoking && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/35"
            onClick={() => {
              setRevoking(null);
              load();
            }}
          />
          <div className="relative w-full max-w-md max-h-[88vh] overflow-y-auto">
            <button
              onClick={() => {
                setRevoking(null);
                load();
              }}
              className="mb-2 ml-auto flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-paper2 text-ink2 hover:border-magenta"
              aria-label="Close revoke"
            >
              ✕
            </button>
            <PlanPreview plan={revoking.plan} />
          </div>
        </div>
      )}
    </div>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone?: "neg" | "pos" }) {
  const cls =
    tone === "neg"
      ? "border-neg/35 bg-neg/[0.05] text-neg"
      : tone === "pos"
        ? "border-pos/30 bg-pos/[0.05] text-ink2"
        : "border-line bg-haze/40 text-ink2";
  return (
    <div className={`rounded-lg border px-3 py-3 text-[12px] ${cls}`}>{children}</div>
  );
}
