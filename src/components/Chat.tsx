"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Plan } from "@/lib/types";
import { useMode } from "./WalletProviders";
import { PlanPreview } from "./PlanPreview";
import { Balances } from "./Balances";

const SUGGESTIONS = [
  "What's in my wallet?",
  "Move half my USDC into a JitoSOL position",
  "Swap 0.1 SOL to USDC",
  "Send 0.05 SOL to <address>",
];

function isPlan(v: unknown): v is Plan {
  return (
    !!v &&
    typeof v === "object" &&
    "transactionBase64" in v &&
    "guardrail" in v &&
    "diff" in v
  );
}

export function Chat() {
  const { mode } = useMode();
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        body: { mode, owner },
      }),
    [mode, owner]
  );

  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";
  const disabled = !owner;

  function submit(text: string) {
    const t = text.trim();
    if (!t || disabled || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 sm:px-0 py-4 space-y-4"
      >
        {messages.length === 0 ? (
          <EmptyState disabled={disabled} onPick={submit} />
        ) : (
          messages.map((m) => <MessageBlock key={m.id} message={m} />)
        )}
        {busy && <Thinking />}
        {error && (
          <div className="text-xs text-neg px-1">
            {error.message || "Something went wrong."}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t border-hairline pt-3 pb-1"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder={
              disabled ? "Connect a wallet to start…" : "State an intent…"
            }
            disabled={disabled}
            aria-label="Message"
            className="flex-1 resize-none rounded-xl bg-surface border border-hairline px-3.5 py-3 text-sm outline-none focus:border-accent/60 placeholder:text-faint max-h-40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || busy || !input.trim()}
            className="shrink-0 rounded-xl bg-accent text-canvas h-11 w-11 grid place-items-center disabled:bg-raised disabled:text-faint transition-colors"
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBlock({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[92%] sm:max-w-[85%] space-y-3 ${isUser ? "items-end" : ""}`}>
        {message.parts.map((part, i) => (
          <PartView key={i} part={part} isUser={isUser} />
        ))}
      </div>
    </div>
  );
}

function PartView({
  part,
  isUser,
}: {
  part: UIMessage["parts"][number];
  isUser: boolean;
}) {
  if (part.type === "text") {
    const text = (part as { text: string }).text;
    if (!text) return null;
    return (
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-accent/10 text-ink border border-accent/20"
            : "bg-surface/70 text-ink/90 border border-hairline"
        }`}
      >
        {text}
      </div>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const toolName = part.type.slice("tool-".length);
    const p = part as {
      state?: string;
      output?: unknown;
      errorText?: string;
    };

    if (p.state === "output-available") {
      const out = p.output;
      if (isPlan(out)) return <PlanPreview plan={out} />;
      if (
        toolName === "read_balances" &&
        out &&
        typeof out === "object" &&
        "balances" in out
      ) {
        const o = out as { balances: never; mode: string };
        return <Balances balances={o.balances} mode={o.mode} />;
      }
      if (out && typeof out === "object" && "error" in out) {
        return (
          <ToolNote tone="neg">{(out as { error: string }).error}</ToolNote>
        );
      }
      // quote_swap or other informational output — keep it quiet.
      return null;
    }
    if (p.state === "output-error") {
      return <ToolNote tone="neg">{p.errorText ?? "Tool error."}</ToolNote>;
    }
    return <ToolNote tone="muted">Running {label(toolName)}…</ToolNote>;
  }

  return null;
}

function label(tool: string): string {
  return (
    {
      read_balances: "balance read",
      quote_swap: "quote",
      build_transfer_plan: "transfer plan",
      build_swap_plan: "swap plan",
    }[tool] ?? tool
  );
}

function ToolNote({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "muted" | "neg";
}) {
  return (
    <div
      className={`text-xs rounded-lg px-3 py-2 border ${
        tone === "neg"
          ? "text-neg border-neg/30 bg-neg/5"
          : "text-muted border-hairline bg-surface/50"
      }`}
    >
      {children}
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex gap-1.5 px-2 items-center text-faint">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-faint animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function EmptyState({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (t: string) => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 gap-6">
      <div className="space-y-2 max-w-md">
        <h2 className="text-lg font-medium text-ink">
          State an intent. See the risk before you sign.
        </h2>
        <p className="text-sm text-muted leading-relaxed">
          WalletChat plans your action, simulates it against live chain state,
          and shows the exact balance diff. Nothing signs until guardrails pass
          and you click confirm.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            disabled={disabled}
            className="text-xs rounded-full border border-hairline bg-surface/60 px-3 py-1.5 text-muted hover:text-ink hover:border-accent/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {s}
          </button>
        ))}
      </div>
      {disabled && (
        <p className="text-[11px] text-faint">Connect a wallet to begin.</p>
      )}
    </div>
  );
}
