"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { notify } from "@/lib/toast";
import type { Chain, Plan } from "@/lib/types";
import { useWalletChat } from "./WalletProviders";
import { useActiveOwner } from "./wallet-hooks";
import { PlanPreview } from "./PlanPreview";
import { Balances } from "./Balances";
import { CHAINS } from "@/lib/chains";
import type { Conversation } from "@/lib/chat-store";
import type { ChatContext } from "./useConversations";
import { entriesForChain, ADDRESS_BOOK_EVENT } from "@/lib/address-book";
import { getPolicyOverride, getMainnetSigning, POLICY_EVENT } from "@/lib/policy-store";

const SUGGESTIONS: Record<Chain, string[]> = {
  solana: [
    "What's in my wallet?",
    "Move half my USDC into a JitoSOL position",
    "Swap 0.1 SOL to USDC",
    "Send 0.05 SOL to <address>",
  ],
  ethereum: [
    "What's in my wallet?",
    "Swap 0.05 ETH into WBTC",
    "Send 0.01 ETH to <0x…>",
    "Move half my USDC to <0x…>",
  ],
  bitcoin: [
    "What's my balance?",
    "Send 0.001 BTC to <bc1…>",
    "Send 5000 sats to <address>, fastest fee",
  ],
};

function isPlan(v: unknown): v is Plan {
  return (
    !!v &&
    typeof v === "object" &&
    "transactionBase64" in v &&
    "guardrail" in v &&
    "diff" in v
  );
}

export function Chat({
  conversation,
  onSave,
}: {
  conversation: Conversation;
  onSave: (id: string, messages: UIMessage[], ctx: ChatContext) => void;
}) {
  const { chain, mode, btcPublicKey } = useWalletChat();
  const owner = useActiveOwner() ?? undefined;
  const ownerPublicKey = chain === "bitcoin" ? btcPublicKey ?? undefined : undefined;

  // Refresh forwarded address book / guardrail settings when they change.
  const [settingsV, setSettingsV] = useState(0);
  useEffect(() => {
    const h = () => setSettingsV((v) => v + 1);
    window.addEventListener(ADDRESS_BOOK_EVENT, h);
    window.addEventListener(POLICY_EVENT, h);
    return () => {
      window.removeEventListener(ADDRESS_BOOK_EVENT, h);
      window.removeEventListener(POLICY_EVENT, h);
    };
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        body: {
          chain,
          mode,
          owner,
          ownerPublicKey,
          addressBook: entriesForChain(chain).map((e) => ({
            label: e.label,
            address: e.address,
          })),
          policyOverride: getPolicyOverride(),
          allowMainnetSign: getMainnetSigning(),
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chain, mode, owner, ownerPublicKey, settingsV]
  );

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    id: conversation.id,
    messages: conversation.messages,
    transport,
  });
  const [input, setInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToLatest() {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  // Auto-follow the stream only when the reader is already at the bottom.
  useEffect(() => {
    if (atBottom) scrollToLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status]);

  // Persist the conversation once a turn settles (not on every streamed token).
  useEffect(() => {
    if ((status === "ready" || status === "error") && messages.length > 0) {
      onSave(conversation.id, messages, { chain, mode, owner: owner ?? null });
    }
  }, [status, messages, conversation.id, chain, mode, owner, onSave]);

  const busy = status === "submitted" || status === "streaming";
  const disabled = !owner;

  function submit(text: string) {
    const t = text.trim();
    if (!t || disabled || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden py-5 space-y-5"
      >
        {messages.length === 0 ? (
          <EmptyState disabled={disabled} onPick={submit} suggestions={SUGGESTIONS[chain]} />
        ) : (
          messages.map((m) => (
            <MessageBlock
              key={m.id}
              message={m}
              canRegenerate={m.id === lastAssistantId && !busy}
              onRegenerate={() => regenerate()}
            />
          ))
        )}
        {busy && <Thinking />}
        {error && (
          <div className="font-mono text-xs text-neg px-1">
            {error.message || "Something went wrong."}
          </div>
        )}
      </div>

      {/* Intent console. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="relative pb-2"
      >
        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToLatest}
            aria-label="Scroll to latest"
            className="absolute -top-11 left-1/2 -translate-x-1/2 z-10 h-8 w-8 grid place-items-center rounded-full border border-line bg-paper2 text-ink2 shadow-lg hover:border-magenta hover:text-ink transition-colors"
          >
            ↓
          </button>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-line bg-paper2/80 focus-within:border-magenta/50 transition-colors px-3 py-2">
          <span className="font-mono text-magenta text-sm pb-2.5 select-none">›</span>
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
            placeholder={disabled ? "Connect a wallet to begin…" : "State an intent…"}
            disabled={disabled}
            aria-label="Message"
            className="flex-1 resize-none bg-transparent py-2 text-sm outline-none focus:outline-none focus-visible:outline-none placeholder:text-ink3 max-h-40 disabled:opacity-50"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="shrink-0 rounded-lg bg-ink text-paper h-9 w-9 grid place-items-center font-mono text-xs transition-colors hover:bg-magenta"
              aria-label="Stop generating"
            >
              ■
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              className="shrink-0 rounded-lg bg-magenta text-paper h-9 w-9 grid place-items-center font-mono text-base disabled:bg-haze disabled:text-ink3 transition-colors hover:bg-ink"
              aria-label="Send"
            >
              ↵
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function MessageBlock({
  message,
  canRegenerate,
  onRegenerate,
}: {
  message: UIMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n")
    .trim();
  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[93%] sm:max-w-[86%] min-w-0 space-y-2 ${isUser ? "flex flex-col items-end" : ""}`}>
        {message.parts.map((part, i) => (
          <PartView key={i} part={part} isUser={isUser} />
        ))}
        {(text || canRegenerate) && (
          <MessageActions
            text={text}
            isUser={isUser}
            canRegenerate={canRegenerate}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}

function MessageActions({
  text,
  isUser,
  canRegenerate,
  onRegenerate,
}: {
  text: string;
  isUser: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {text && (
        <button
          onClick={() => {
            navigator.clipboard?.writeText(text);
            notify("Copied message", "success");
          }}
          className="font-mono text-[10px] text-ink3 hover:text-ink px-1.5 py-0.5 rounded transition-colors"
        >
          copy
        </button>
      )}
      {canRegenerate && (
        <button
          onClick={onRegenerate}
          className="font-mono text-[10px] text-ink3 hover:text-ink px-1.5 py-0.5 rounded transition-colors"
        >
          regenerate
        </button>
      )}
    </div>
  );
}

/** Markdown mapped to the app's type scale — so lists, code, and links render. */
const MD: Components = {
  p: ({ node, ...p }) => <p className="my-1.5 first:mt-0 last:mb-0" {...p} />,
  a: ({ node, ...p }) => (
    <a className="text-magenta underline underline-offset-2 break-words" target="_blank" rel="noreferrer" {...p} />
  ),
  ul: ({ node, ...p }) => <ul className="my-1.5 list-disc pl-5 space-y-0.5" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-1.5 list-decimal pl-5 space-y-0.5" {...p} />,
  li: ({ node, ...p }) => <li className="marker:text-ink3" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-ink" {...p} />,
  h1: ({ node, ...p }) => <h3 className="mt-2 mb-1 text-[15px] font-semibold text-ink" {...p} />,
  h2: ({ node, ...p }) => <h3 className="mt-2 mb-1 text-[14px] font-semibold text-ink" {...p} />,
  h3: ({ node, ...p }) => <h3 className="mt-2 mb-1 text-[13px] font-semibold text-ink" {...p} />,
  code: ({ node, ...p }) => (
    <code className="font-mono text-[0.85em] bg-haze rounded px-1 py-0.5" {...p} />
  ),
  pre: ({ node, ...p }) => (
    <pre
      className="my-2 overflow-x-auto rounded-lg border border-line bg-paper2 p-3 text-[12px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
      {...p}
    />
  ),
  blockquote: ({ node, ...p }) => (
    <blockquote className="my-1.5 border-l-2 border-line pl-3 text-ink3" {...p} />
  ),
};

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
    return isUser ? (
      <div className="rounded-2xl rounded-br-sm bg-haze/70 border-r-2 border-magenta/50 px-3.5 py-2.5 text-sm leading-relaxed text-ink whitespace-pre-wrap break-words">
        {text}
      </div>
    ) : (
      <div className="text-sm leading-relaxed text-ink2 break-words px-0.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
          {text}
        </ReactMarkdown>
      </div>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const toolName = part.type.slice("tool-".length);
    const p = part as { state?: string; output?: unknown; errorText?: string };

    if (p.state === "output-available") {
      const out = p.output;
      if (isPlan(out)) return <PlanPreview plan={out} />;
      if (out && typeof out === "object" && "balances" in out) {
        const o = out as { balances: never; mode: string };
        return <Balances balances={o.balances} mode={o.mode} />;
      }
      if (out && typeof out === "object" && "error" in out) {
        return <ToolNote tone="neg">{(out as { error: string }).error}</ToolNote>;
      }
      return null;
    }
    if (p.state === "output-error") {
      return <ToolNote tone="neg">{p.errorText ?? "Tool error."}</ToolNote>;
    }
    return (
      <ToolNote tone="run">
        {label(toolName)}
        <span className="animate-blink">▍</span>
      </ToolNote>
    );
  }

  return null;
}

function label(tool: string): string {
  return (
    {
      read_balances: "reading balances",
      quote_swap: "fetching quote",
      build_transfer_plan: "building transfer plan",
      build_swap_plan: "building swap plan",
    }[tool] ?? tool
  );
}

function ToolNote({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "run" | "neg";
}) {
  return (
    <div
      className={`font-mono text-[11px] tracking-wide ${
        tone === "neg"
          ? "text-neg border border-neg/30 bg-neg/5 rounded-lg px-3 py-2"
          : "text-ink3 px-0.5"
      }`}
    >
      {children}
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 px-1 font-mono text-[11px] text-ink3">
      <span className="animate-blink">▍</span>
      <span className="tracking-label uppercase">verifying</span>
    </div>
  );
}

function EmptyState({
  disabled,
  onPick,
  suggestions,
}: {
  disabled: boolean;
  onPick: (t: string) => void;
  suggestions: string[];
}) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center text-center px-2 py-8 gap-6 sm:gap-7">
      <div className="space-y-3 max-w-md">
        <div className="eyebrow">state intent · read the risk · then sign</div>
        <h2 className="text-[22px] sm:text-[28px] leading-[1.15] font-semibold text-ink tracking-tight">
          See exactly what a transaction does
          <br />
          before it happens.
        </h2>
        <p className="text-[13px] text-ink2 leading-relaxed">
          Plan an intent in plain language. WalletChat simulates it against live
          chain state and prints a verification slip with the exact balance diff —
          nothing signs until every guardrail passes and you arm it.
        </p>
      </div>

      <SpecimenSlip />

      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            disabled={disabled}
            className="font-mono text-[11px] rounded-lg border border-line bg-paper2/60 px-3 py-1.5 text-ink2 hover:text-ink hover:border-magenta/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A faded example verification slip — teaches what the instrument produces. */
function SpecimenSlip() {
  return (
    <div className="relative w-full max-w-sm sm:max-w-md select-none opacity-90">
      <div className="perforation" />
      <div className="ledger-rule rounded-b-xl border border-line border-t-0 slip-paper px-4 pt-3 pb-4 relative overflow-hidden">
        <div
          className="absolute right-3 top-6 font-mono text-[26px] font-semibold text-ink3/25 tracking-widest -rotate-[8deg] border-2 border-ink3/20 rounded px-2"
          aria-hidden
        >
          SPECIMEN
        </div>
        <div className="flex items-center justify-between">
          <span className="eyebrow">verification slip</span>
          <span className="num text-[10px] text-ink3">plan · example</span>
        </div>
        <div className="mt-3 space-y-1.5 text-left">
          <SpecimenRow sym="USDC" v="−250.00" tone="neg" />
          <SpecimenRow sym="JitoSOL" v="+1.6820" tone="pos" />
        </div>
        <div className="mt-3 pt-2 border-t border-line/60 flex items-center justify-between">
          <span className="eyebrow">guardrails</span>
          <span className="font-mono text-[11px] text-pos tracking-label">PASS</span>
        </div>
      </div>
    </div>
  );
}

function SpecimenRow({ sym, v, tone }: { sym: string; v: string; tone: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[12px] text-ink2">{sym}</span>
      <span className={`num text-[13px] ${tone === "pos" ? "text-pos" : "text-neg"}`}>{v}</span>
    </div>
  );
}
