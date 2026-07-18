"use client";

import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import type { Plan, AssetDelta, GuardrailCheck, BtcIo } from "@/lib/types";
import { formatSigned, formatUsd, formatUi, pct, shortAddr } from "@/lib/format";
import { useWalletChat } from "./WalletProviders";
import { sendEvmTx, getEthereum } from "@/lib/wallet/evm";
import { signAndPushPsbt, getUnisat } from "@/lib/wallet/btc";

/**
 * THE signature element. Makes the risk of a transaction legible at a glance and
 * gates the confirm affordance on `plan.signable`. Immediately before signing we
 * re-simulate against fresh state. Signing is chain-specific and always
 * client-side: Solana via wallet-adapter, Ethereum via MetaMask, Bitcoin via
 * Unisat. The server never signs.
 */

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type SignState =
  | { s: "idle" }
  | { s: "resimulating" }
  | { s: "drift"; message: string }
  | { s: "signing" }
  | { s: "sending" }
  | { s: "confirmed"; signature: string }
  | { s: "error"; message: string };

export function PlanPreview({ plan: initialPlan }: { plan: Plan }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { evmAddress, btcAddress } = useWalletChat();
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<SignState>({ s: "idle" });

  const needsTyped = plan.guardrail.typedConfirmation;
  const typedOk =
    !needsTyped || typed.trim().toLowerCase() === needsTyped.toLowerCase();

  const walletMatches =
    plan.chain === "solana"
      ? publicKey?.toBase58() === plan.owner
      : plan.chain === "ethereum"
        ? evmAddress?.toLowerCase() === plan.owner.toLowerCase()
        : btcAddress === plan.owner;

  const hasSigner =
    plan.chain === "solana"
      ? !!signTransaction
      : plan.chain === "ethereum"
        ? !!getEthereum()
        : !!getUnisat();

  const canConfirm =
    plan.signable &&
    typedOk &&
    hasSigner &&
    walletMatches &&
    (state.s === "idle" || state.s === "drift" || state.s === "error");

  async function onConfirm() {
    try {
      // 1) Drift defense — re-simulate/rebuild against fresh state.
      setState({ s: "resimulating" });
      const res = await fetch("/api/resim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plan),
      });
      const data = (await res.json()) as { plan?: Plan; error?: string };
      if (!res.ok || !data.plan) {
        setState({ s: "error", message: data.error ?? "Re-simulation failed." });
        return;
      }
      const fresh = data.plan;
      setPlan(fresh);
      if (!fresh.signable) {
        setState({
          s: "drift",
          message:
            "State moved — this plan is no longer safe to sign. Review the updated preview and ask again.",
        });
        return;
      }

      // 2) Sign + submit, per chain. Keys never leave the wallet.
      setState({ s: "signing" });
      let signature: string;
      if (fresh.chain === "solana") {
        if (!signTransaction || !fresh.transactionBase64)
          throw new Error("Solana wallet unavailable.");
        const tx = VersionedTransaction.deserialize(
          b64ToBytes(fresh.transactionBase64)
        );
        const signed = await signTransaction(tx);
        setState({ s: "sending" });
        signature = await connection.sendRawTransaction(signed.serialize(), {
          maxRetries: 3,
        });
        const bh = await connection.getLatestBlockhash("confirmed");
        await connection.confirmTransaction({ signature, ...bh }, "confirmed");
      } else if (fresh.chain === "ethereum") {
        if (!fresh.evmTx) throw new Error("Missing EVM transaction.");
        setState({ s: "sending" });
        signature = await sendEvmTx(fresh.evmTx, fresh.mode);
      } else {
        if (!fresh.btc) throw new Error("Missing Bitcoin PSBT.");
        setState({ s: "sending" });
        signature = await signAndPushPsbt(fresh.btc.psbtBase64);
      }
      setState({ s: "confirmed", signature });
    } catch (e) {
      setState({ s: "error", message: (e as Error).message });
    }
  }

  const outs = plan.diff.filter((d) => BigInt(d.delta) < 0n);
  const ins = plan.diff.filter((d) => BigInt(d.delta) > 0n);

  return (
    <div className="animate-fade-up rounded-2xl border border-hairline bg-surface/80 backdrop-blur-sm overflow-hidden">
      <Header plan={plan} />
      {plan.route && <RouteStrip plan={plan} />}

      <div className="px-4 sm:px-5 py-4 space-y-4">
        <section className="grid gap-2">
          <Label>Balance changes</Label>
          {plan.diff.length === 0 && (
            <p className="text-sm text-muted">No balance change detected.</p>
          )}
          {outs.map((d, i) => (
            <DeltaRow key={`o${i}`} d={d} index={i} />
          ))}
          {ins.map((d, i) => (
            <DeltaRow key={`i${i}`} d={d} index={outs.length + i} />
          ))}
        </section>

        {plan.btc && <BtcIoStrip inputs={plan.btc.inputs} outputs={plan.btc.outputs} />}

        <FeeRow plan={plan} />

        <Guardrails checks={plan.guardrail.checks} pass={plan.guardrail.pass} />

        {plan.warnings.length > 0 && (
          <ul className="space-y-1">
            {plan.warnings.map((w, i) => (
              <li key={i} className="text-xs text-warn/90 flex gap-2">
                <span aria-hidden>▲</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {!plan.simulation.success && plan.chain !== "bitcoin" && (
          <SimLogs logs={plan.simulation.logs} err={plan.simulation.err} />
        )}

        <ConfirmZone
          plan={plan}
          state={state}
          canConfirm={canConfirm}
          needsTyped={needsTyped}
          typed={typed}
          setTyped={setTyped}
          typedOk={typedOk}
          walletConnected={hasSigner && walletMatches}
          onConfirm={onConfirm}
        />
      </div>
    </div>
  );
}

function Header({ plan }: { plan: Plan }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-hairline">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink truncate">
          {plan.intentSummary}
        </div>
        <div className="text-[11px] text-faint mt-0.5 num">plan {plan.id}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge tone="ink">{plan.chain}</Badge>
        <Badge tone={plan.mode === "devnet" ? "accent" : "muted"}>{plan.mode}</Badge>
        <Badge tone="muted">{plan.kind}</Badge>
      </div>
    </div>
  );
}

function RouteStrip({ plan }: { plan: Plan }) {
  const r = plan.route!;
  return (
    <div className="px-4 sm:px-5 py-3 border-b border-hairline bg-raised/40">
      <div className="flex items-center gap-1.5 flex-wrap">
        {r.steps.map((t, i) => (
          <React.Fragment key={`${t.mint}-${i}`}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas px-2.5 py-1 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {t.symbol}
            </span>
            {i < r.steps.length - 1 && (
              <span className="text-faint text-xs" aria-hidden>→</span>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <Metric label="Route">{r.markets.join(" · ") || "direct"}</Metric>
        <Metric label="Price impact" tone={r.priceImpactPct >= 1 ? "warn" : "default"}>
          {pct(r.priceImpactPct)}
        </Metric>
        <Metric label="Slippage">{pct(r.slippageBps / 100)}</Metric>
      </div>
    </div>
  );
}

function DeltaRow({ d, index }: { d: AssetDelta; index: number }) {
  const neg = BigInt(d.delta) < 0n;
  return (
    <div
      className="flex items-center justify-between rounded-lg bg-raised/50 px-3 py-2.5 animate-count-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-[11px] ${
            neg ? "bg-neg/10 text-neg" : "bg-pos/10 text-pos"
          }`}
          aria-hidden
        >
          {neg ? "↑" : "↓"}
        </span>
        <div className="min-w-0">
          <div className="text-sm text-ink flex items-center gap-1.5">
            {d.symbol}
            {d.ataCreated && (
              <span className="text-[10px] text-faint border border-hairline rounded px-1 py-px">
                new account
              </span>
            )}
          </div>
          <div className="text-[11px] text-faint">
            {neg ? "out" : "in"}
            {d.isNative ? " · native" : ""}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`num text-sm ${neg ? "text-neg" : "text-pos"}`}>
          {formatSigned(d.uiDelta)}
        </div>
        <div className="num text-[11px] text-faint">
          {d.usd != null ? formatUsd(d.usd) : "unpriced"}
        </div>
      </div>
    </div>
  );
}

function BtcIoStrip({ inputs, outputs }: { inputs: BtcIo[]; outputs: BtcIo[] }) {
  return (
    <section className="rounded-xl border border-hairline overflow-hidden text-[11px]">
      <div className="grid grid-cols-2 divide-x divide-hairline">
        <div className="p-3">
          <Label>Inputs ({inputs.length} UTXO)</Label>
          <ul className="mt-1.5 space-y-1">
            {inputs.map((i, n) => (
              <li key={n} className="flex justify-between gap-2">
                <span className="text-faint num">{shortAddr(i.address, 5)}</span>
                <span className="num text-ink/80">{formatUi(i.valueSat / 1e8)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-3">
          <Label>Outputs</Label>
          <ul className="mt-1.5 space-y-1">
            {outputs.map((o, n) => (
              <li key={n} className="flex justify-between gap-2">
                <span className="text-faint num flex items-center gap-1">
                  {shortAddr(o.address, 5)}
                  {o.isChange && <span className="text-[9px] text-accent">change</span>}
                </span>
                <span className="num text-ink/80">{formatUi(o.valueSat / 1e8)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeeRow({ plan }: { plan: Plan }) {
  const f = plan.fee;
  const toNative = (n: number) => formatUi(n / 10 ** plan.nativeDecimals, 8);
  return (
    <div className="flex items-center justify-between text-[11px] text-muted border-t border-hairline pt-3">
      <span>{plan.chain === "bitcoin" ? "Network fee" : "Network fee + rent"}</span>
      <span className="num text-ink/80">
        {toNative(f.totalLamports)} {plan.nativeSymbol}
        {f.rentLamports > 0 && (
          <span className="text-faint">
            {"  "}({toNative(f.baseLamports + f.priorityLamports)} fee +{" "}
            {toNative(f.rentLamports)} rent)
          </span>
        )}
      </span>
    </div>
  );
}

function Guardrails({ checks, pass }: { checks: GuardrailCheck[]; pass: boolean }) {
  return (
    <section className="rounded-xl border border-hairline overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-raised/50">
        <Label>Guardrails</Label>
        <Badge tone={pass ? "accent" : "neg"}>{pass ? "pass" : "blocked"}</Badge>
      </div>
      <ul className="divide-y divide-hairline">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5 px-3 py-2">
            <CheckIcon passed={c.passed} severity={c.severity} />
            <div className="min-w-0">
              <div className="text-[12px] text-ink/90">{c.label}</div>
              <div className="text-[11px] text-faint">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckIcon({
  passed,
  severity,
}: {
  passed: boolean;
  severity: "block" | "warn";
}) {
  if (passed) return <span className="text-pos text-xs mt-0.5" aria-label="passed">✓</span>;
  if (severity === "warn")
    return <span className="text-warn text-xs mt-0.5" aria-label="warning">▲</span>;
  return <span className="text-neg text-xs mt-0.5" aria-label="blocked">✕</span>;
}

function SimLogs({ logs, err }: { logs: string[]; err: unknown }) {
  return (
    <details className="rounded-lg border border-neg/30 bg-neg/5 px-3 py-2">
      <summary className="text-xs text-neg cursor-pointer">
        Simulation failed — view logs
      </summary>
      <pre className="mt-2 text-[10px] leading-relaxed text-muted overflow-x-auto max-h-48">
        {JSON.stringify(err, null, 2)}
        {"\n\n"}
        {logs.join("\n")}
      </pre>
    </details>
  );
}

const EXPLORER: Record<string, (sig: string, mainnet: boolean) => string> = {
  solana: (s, m) =>
    `https://explorer.solana.com/tx/${s}?cluster=${m ? "mainnet-beta" : "devnet"}`,
  ethereum: (s, m) => `https://${m ? "" : "sepolia."}etherscan.io/tx/${s}`,
  bitcoin: (s, m) => `https://mempool.space/${m ? "" : "testnet4/"}tx/${s}`,
};

function ConfirmZone({
  plan,
  state,
  canConfirm,
  needsTyped,
  typed,
  setTyped,
  typedOk,
  walletConnected,
  onConfirm,
}: {
  plan: Plan;
  state: SignState;
  canConfirm: boolean;
  needsTyped: string | null;
  typed: string;
  setTyped: (v: string) => void;
  typedOk: boolean;
  walletConnected: boolean;
  onConfirm: () => void;
}) {
  if (state.s === "confirmed") {
    const url = EXPLORER[plan.chain](state.signature, plan.mode === "mainnet");
    return (
      <div className="rounded-xl border border-pos/30 bg-pos/5 px-4 py-3 animate-fade-up">
        <div className="text-sm text-pos font-medium">
          Broadcast on {plan.chain} {plan.mode}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="num text-[11px] text-accent hover:underline break-all"
        >
          {shortAddr(state.signature, 8)} ↗
        </a>
      </div>
    );
  }

  const reason = disabledReason(plan, walletConnected, typedOk, needsTyped);
  const busy =
    state.s === "resimulating" || state.s === "signing" || state.s === "sending";

  return (
    <div className="space-y-2.5 pt-1">
      {needsTyped && plan.signable && (
        <label className="block">
          <span className="text-[11px] text-muted">
            High value — type <span className="num text-ink">“{needsTyped}”</span> to enable:
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={needsTyped}
            aria-label="Type the confirmation phrase"
            className="mt-1 w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm num placeholder:text-faint focus:border-accent outline-none"
          />
        </label>
      )}

      <button
        onClick={onConfirm}
        disabled={!canConfirm || busy}
        className={`w-full rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
          canConfirm && !busy
            ? "bg-accent text-canvas hover:bg-accent-dim animate-pulse-ring"
            : "bg-raised text-faint cursor-not-allowed"
        }`}
      >
        {busy ? busyLabel(state) : plan.signable ? "Confirm & sign" : "Signing disabled"}
      </button>

      {state.s === "drift" && <p className="text-xs text-warn">{state.message}</p>}
      {state.s === "error" && <p className="text-xs text-neg break-words">{state.message}</p>}
      {!plan.signable && reason && (
        <p className="text-[11px] text-faint text-center">{reason}</p>
      )}
    </div>
  );
}

function busyLabel(state: SignState): string {
  switch (state.s) {
    case "resimulating":
      return "Re-checking…";
    case "signing":
      return "Awaiting signature…";
    case "sending":
      return "Submitting…";
    default:
      return "Working…";
  }
}

function disabledReason(
  plan: Plan,
  walletConnected: boolean,
  typedOk: boolean,
  needsTyped: string | null
): string | null {
  if (plan.mode === "mainnet")
    return "Mainnet is read-only in this demo — the plan and diff are real, signing is off.";
  if (!plan.simulation.success && plan.chain !== "bitcoin")
    return "Simulation failed, so this cannot be signed.";
  if (!plan.guardrail.pass) return "A guardrail is blocking this plan.";
  if (!walletConnected) return "Connect the matching wallet to sign.";
  if (needsTyped && !typedOk) return "Type the confirmation phrase to continue.";
  return null;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider text-faint">{children}</span>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "accent" | "muted" | "neg" | "ink";
}) {
  const cls =
    tone === "accent"
      ? "border-accent/40 text-accent"
      : tone === "neg"
        ? "border-neg/40 text-neg"
        : tone === "ink"
          ? "border-hairline text-ink/80"
          : "border-hairline text-muted";
  return (
    <span className={`text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 ${cls}`}>
      {children}
    </span>
  );
}

function Metric({
  label,
  children,
  tone = "default",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "default" | "warn";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-faint">{label}</span>
      <span className={`num ${tone === "warn" ? "text-warn" : "text-ink/80"}`}>
        {children}
      </span>
    </span>
  );
}
