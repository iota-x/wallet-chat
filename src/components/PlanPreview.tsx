"use client";

import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import type { Plan, AssetDelta, GuardrailCheck, BtcIo } from "@/lib/types";
import { formatSigned, formatUsd, formatUi, pct, shortAddr } from "@/lib/format";
import { networkName } from "@/lib/chains";
import { useWalletChat } from "./WalletProviders";
import { sendEvmTx, getEthereum } from "@/lib/wallet/evm";
import { signAndPushPsbt, getUnisat } from "@/lib/wallet/btc";
import { recordTransaction } from "@/lib/tx-store";

/**
 * THE signature element — the verification slip. A printed instrument readout
 * that makes a transaction's risk legible: a document header, the exact balance
 * diff as a ledger, an inspection stamp (PASS / BLOCKED), and an ARM-TO-SIGN
 * control that stays locked until `plan.signable` is true. Immediately before
 * signing we re-simulate against fresh state. Signing is chain-specific and
 * always client-side — the server never holds a key.
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
            "State moved — this plan is no longer safe to sign. Review the updated slip and ask again.",
        });
        return;
      }

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
      recordTransaction({
        chain: fresh.chain,
        mode: fresh.mode,
        kind: fresh.kind,
        signature,
        owner: fresh.owner,
        summary: fresh.intentSummary,
        // Solana is awaited to confirmation above; EVM/BTC are broadcast only.
        status: fresh.chain === "solana" ? "confirmed" : "pending",
        delta: fresh.diff
          .filter((d) => BigInt(d.delta) !== 0n)
          .slice(0, 3)
          .map((d) => `${formatSigned(d.uiDelta)} ${d.symbol}`)
          .join(" · "),
      });
      setState({ s: "confirmed", signature });
    } catch (e) {
      setState({ s: "error", message: (e as Error).message });
    }
  }

  const outs = plan.diff.filter((d) => BigInt(d.delta) < 0n);
  const ins = plan.diff.filter((d) => BigInt(d.delta) > 0n);

  return (
    <div className="animate-print-in w-full">
      <div className="perforation" />
      <div className="ledger-rule rounded-b-2xl border border-line border-t-0 slip-paper overflow-hidden">
        <SlipHeader plan={plan} />
        {plan.route && <RouteStrip plan={plan} />}

        <div className="px-4 sm:px-5 py-4 space-y-4">
          <section className="space-y-1.5">
            <span className="eyebrow">balance changes</span>
            {plan.diff.length === 0 && (
              <p className="text-sm text-ink2">No balance change detected.</p>
            )}
            <div className="rounded-lg">
              {outs.map((d, i) => (
                <LedgerRow key={`o${i}`} d={d} index={i} />
              ))}
              {ins.map((d, i) => (
                <LedgerRow key={`i${i}`} d={d} index={outs.length + i} />
              ))}
            </div>
          </section>

          {plan.btc && <BtcIoStrip inputs={plan.btc.inputs} outputs={plan.btc.outputs} />}

          <FeeRow plan={plan} />

          <Guardrails checks={plan.guardrail.checks} pass={plan.guardrail.pass} />

          {plan.warnings.length > 0 && (
            <ul className="space-y-1">
              {plan.warnings.map((w, i) => (
                <li key={i} className="text-[11px] text-warn/90 flex gap-2 font-mono">
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
            walletReady={hasSigner && walletMatches}
            onConfirm={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}

function SlipHeader({ plan }: { plan: Plan }) {
  return (
    <div className="px-4 sm:px-5 pt-3.5 pb-3 border-b border-line/60 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="eyebrow">verification slip · {plan.kind}</span>
        <div className="text-[13px] text-ink font-medium mt-1.5 leading-snug">
          {plan.intentSummary}
        </div>
      </div>
      <div className="text-right shrink-0 space-y-1.5">
        <div className="num text-[10px] text-ink3">{plan.id}</div>
        <div className="flex gap-1 justify-end">
          <Tag>{plan.chain}</Tag>
          <Tag tone={plan.mode === "mainnet" ? "neg" : "magenta"}>
            {networkName(plan.chain, plan.mode)}
          </Tag>
        </div>
      </div>
    </div>
  );
}

function RouteStrip({ plan }: { plan: Plan }) {
  const r = plan.route!;
  return (
    <div className="px-4 sm:px-5 py-3 border-b border-line/60 bg-paper2/40">
      <div className="flex items-center gap-1 flex-wrap">
        {r.steps.map((t, i) => (
          <React.Fragment key={`${t.mint}-${i}`}>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1 font-mono text-[11px]">
              <span className="h-1 w-1 rounded-full bg-magenta" />
              {t.symbol}
            </span>
            {i < r.steps.length - 1 && (
              <span className="text-ink3 text-[11px] px-0.5" aria-hidden>
                ──▸
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
        <Metric label="via">{r.markets.join(" · ") || "direct"}</Metric>
        <Metric label="impact" tone={r.priceImpactPct >= 1 ? "warn" : "default"}>
          {pct(r.priceImpactPct)}
        </Metric>
        <Metric label="slippage">{pct(r.slippageBps / 100)}</Metric>
      </div>
    </div>
  );
}

function LedgerRow({ d, index }: { d: AssetDelta; index: number }) {
  const neg = BigInt(d.delta) < 0n;
  return (
    <div
      className="flex items-baseline gap-2 py-2 animate-count-in"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <span className="font-mono text-[13px] text-ink">{d.symbol}</span>
      <span className="font-mono text-[9px] uppercase tracking-label text-ink3">
        {neg ? "debit" : "credit"}
      </span>
      {d.ataCreated && (
        <span className="font-mono text-[9px] text-ink3 border border-line rounded px-1">
          new acct
        </span>
      )}
      {/* dotted leader connecting label to value, receipt-style */}
      <span className="flex-1 self-center border-b border-dotted border-line/70" />
      <span className="text-right">
        <span className={`num text-[15px] ${neg ? "text-neg" : "text-pos"}`}>
          {formatSigned(d.uiDelta)}
        </span>
        <span className="num text-[10px] text-ink3 ml-2">
          {d.usd != null ? formatUsd(d.usd) : "—"}
        </span>
      </span>
    </div>
  );
}

function BtcIoStrip({ inputs, outputs }: { inputs: BtcIo[]; outputs: BtcIo[] }) {
  return (
    <section className="rounded-lg border border-line/60 overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-line/60">
        <div className="p-3">
          <span className="eyebrow">inputs · {inputs.length} utxo</span>
          <ul className="mt-2 space-y-1">
            {inputs.map((i, n) => (
              <li key={n} className="flex justify-between gap-2 font-mono text-[11px]">
                <span className="text-ink3">{shortAddr(i.address, 5)}</span>
                <span className="num text-ink2">{formatUi(i.valueSat / 1e8)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-3">
          <span className="eyebrow">outputs</span>
          <ul className="mt-2 space-y-1">
            {outputs.map((o, n) => (
              <li key={n} className="flex justify-between gap-2 font-mono text-[11px]">
                <span className="text-ink3 flex items-center gap-1">
                  {shortAddr(o.address, 5)}
                  {o.isChange && <span className="text-magenta text-[9px]">change</span>}
                </span>
                <span className="num text-ink2">{formatUi(o.valueSat / 1e8)}</span>
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
    <div className="flex items-baseline gap-2 border-t border-line/60 pt-3">
      <span className="eyebrow">{plan.chain === "bitcoin" ? "network fee" : "fee + rent"}</span>
      <span className="flex-1 self-center border-b border-dotted border-line/70" />
      <span className="num text-[12px] text-ink2">
        {toNative(f.totalLamports)} {plan.nativeSymbol}
        {f.rentLamports > 0 && (
          <span className="text-ink3">
            {"  "}({toNative(f.baseLamports + f.priorityLamports)}+{toNative(f.rentLamports)}r)
          </span>
        )}
      </span>
    </div>
  );
}

function Guardrails({ checks, pass }: { checks: GuardrailCheck[]; pass: boolean }) {
  return (
    <section className="relative rounded-lg border border-line/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line/60">
        <span className="eyebrow">guardrail inspection</span>
      </div>
      {/* the inspection stamp */}
      <div
        className={`absolute right-3 top-1.5 animate-stamp-in font-mono text-[15px] font-semibold tracking-label border-2 rounded px-2 py-0.5 ${
          pass ? "text-pos border-pos/50" : "text-neg border-neg/50"
        }`}
        aria-label={pass ? "guardrails passed" : "guardrails blocked"}
      >
        {pass ? "PASS" : "BLOCKED"}
      </div>
      <ul className="divide-y divide-line/60">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5 px-3 py-2">
            <CheckIcon passed={c.passed} severity={c.severity} />
            <div className="min-w-0">
              <div className="font-mono text-[11px] text-ink/90">{c.label}</div>
              <div className="text-[11px] text-ink3 leading-snug">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckIcon({ passed, severity }: { passed: boolean; severity: "block" | "warn" }) {
  if (passed) return <span className="text-pos font-mono text-[11px] mt-0.5" aria-label="pass">✓</span>;
  if (severity === "warn")
    return <span className="text-warn font-mono text-[11px] mt-0.5" aria-label="warn">▲</span>;
  return <span className="text-neg font-mono text-[11px] mt-0.5" aria-label="blocked">✕</span>;
}

function SimLogs({ logs, err }: { logs: string[]; err: unknown }) {
  return (
    <details className="rounded-lg border border-neg/30 bg-neg/5 px-3 py-2">
      <summary className="font-mono text-[11px] text-neg cursor-pointer">
        simulation failed — view logs
      </summary>
      <pre className="mt-2 text-[10px] leading-relaxed text-ink2 overflow-x-auto max-h-48">
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
  walletReady,
  onConfirm,
}: {
  plan: Plan;
  state: SignState;
  canConfirm: boolean;
  needsTyped: string | null;
  typed: string;
  setTyped: (v: string) => void;
  typedOk: boolean;
  walletReady: boolean;
  onConfirm: () => void;
}) {
  if (state.s === "confirmed") {
    const url = EXPLORER[plan.chain](state.signature, plan.mode === "mainnet");
    return (
      <div className="rounded-lg border border-pos/35 bg-pos/[0.06] px-4 py-3 animate-fade-up">
        <div className="font-mono text-[11px] tracking-label uppercase text-pos">
          ✓ broadcast · {plan.chain} {plan.mode}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="num text-[11px] text-magenta hover:underline break-all"
        >
          {shortAddr(state.signature, 8)} ↗
        </a>
      </div>
    );
  }

  const reason = disabledReason(plan, walletReady, typedOk, needsTyped);
  const busy =
    state.s === "resimulating" || state.s === "signing" || state.s === "sending";

  return (
    <div className="space-y-2.5 pt-1">
      {needsTyped && plan.signable && (
        <label className="block">
          <span className="font-mono text-[11px] text-ink2">
            high value — type{" "}
            <span className="text-magenta">“{needsTyped}”</span> to arm:
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={needsTyped}
            aria-label="Type the confirmation phrase"
            className="mt-1.5 w-full rounded-lg bg-paper border border-line px-3 py-2 text-sm num placeholder:text-ink3 focus:border-magenta outline-none"
          />
        </label>
      )}

      <button
        onClick={onConfirm}
        disabled={!canConfirm || busy}
        className={`w-full rounded-lg px-4 py-3 font-mono text-[13px] tracking-label uppercase transition-colors ${
          canConfirm && !busy
            ? "bg-magenta text-paper hover:bg-ink"
            : "bg-haze text-ink3 border border-line cursor-not-allowed"
        }`}
      >
        {busy ? busyLabel(state) : plan.signable ? "▲ arm & sign" : "⦸ signing locked"}
      </button>

      {state.s === "drift" && <p className="text-[11px] text-warn font-mono">{state.message}</p>}
      {state.s === "error" && <p className="text-[11px] text-neg break-words font-mono">{state.message}</p>}
      {!plan.signable && reason && (
        <p className="eyebrow text-center normal-case tracking-normal">{reason}</p>
      )}
    </div>
  );
}

function busyLabel(state: SignState): string {
  switch (state.s) {
    case "resimulating":
      return "re-checking…";
    case "signing":
      return "awaiting signature…";
    case "sending":
      return "broadcasting…";
    default:
      return "working…";
  }
}

function disabledReason(
  plan: Plan,
  walletReady: boolean,
  typedOk: boolean,
  needsTyped: string | null
): string | null {
  if (plan.mode === "mainnet")
    return "mainnet is read-only here — the slip and diff are real, signing is off";
  if (!plan.simulation.success && plan.chain !== "bitcoin")
    return "simulation failed, so this cannot be signed";
  if (!plan.guardrail.pass) return "a guardrail is blocking this plan";
  if (!walletReady) return "connect the matching wallet to sign";
  if (needsTyped && !typedOk) return "type the confirmation phrase to arm";
  return null;
}

function Tag({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "magenta" | "neg";
}) {
  const cls =
    tone === "magenta"
      ? "border-magenta/35 text-magenta"
      : tone === "neg"
        ? "border-neg/40 text-neg"
        : "border-line text-ink2";
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-label rounded border px-1.5 py-0.5 ${cls}`}
    >
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
      <span className="eyebrow">{label}</span>
      <span className={`num text-[11px] ${tone === "warn" ? "text-warn" : "text-ink2"}`}>
        {children}
      </span>
    </span>
  );
}
