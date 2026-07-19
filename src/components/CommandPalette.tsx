"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Chain } from "@/lib/types";
import type { Conversation } from "@/lib/chat-store";
import { CHAINS } from "@/lib/chains";
import { notify } from "@/lib/toast";

type Panel = "portfolio" | "transactions" | "addresses" | "approvals" | "settings";

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/** ⌘K launcher — jump to any chat, panel, chain, or action from one input. */
export function CommandPalette({
  open,
  onClose,
  conversations,
  onNewChat,
  onSelectChat,
  onOpenPanel,
  setChain,
}: {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onOpenPanel: (p: Panel) => void;
  setChain: (c: Chain) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const wrap = (fn: () => void) => () => {
      fn();
      onClose();
    };
    const base: Command[] = [
      { id: "new", label: "New chat", hint: "action", run: wrap(onNewChat) },
      { id: "p-portfolio", label: "Open portfolio", hint: "panel", run: wrap(() => onOpenPanel("portfolio")) },
      { id: "p-tx", label: "Open transactions", hint: "panel", run: wrap(() => onOpenPanel("transactions")) },
      { id: "p-addr", label: "Open address book", hint: "panel", run: wrap(() => onOpenPanel("addresses")) },
      { id: "p-appr", label: "Open approvals", hint: "panel", run: wrap(() => onOpenPanel("approvals")) },
      { id: "p-guard", label: "Open guardrails", hint: "panel", run: wrap(() => onOpenPanel("settings")) },
      ...(Object.keys(CHAINS) as Chain[]).map((c) => ({
        id: `chain-${c}`,
        label: `Switch to ${CHAINS[c].label}`,
        hint: "chain",
        run: wrap(() => setChain(c)),
      })),
      {
        id: "theme",
        label: "Toggle light / dark theme",
        hint: "action",
        run: wrap(() => {
          const cur = document.documentElement.dataset.theme || "light";
          const next = cur === "dark" ? "light" : "dark";
          document.documentElement.dataset.theme = next;
          try {
            localStorage.setItem("wc-theme", next);
          } catch {
            /* ignore */
          }
        }),
      },
      {
        id: "clear",
        label: "Clear all local data",
        hint: "danger",
        run: () => {
          if (!confirm("Erase all conversations, transactions, addresses, and settings on this device?"))
            return;
          [
            "wc-conversations-v1",
            "wc-transactions-v1",
            "wc-address-book-v1",
            "wc-policy-v1",
            "wc-mainnet-signing-v1",
            "wc-sidebar",
          ].forEach((k) => localStorage.removeItem(k));
          notify("Local data cleared", "info");
          location.reload();
        },
      },
    ];
    const chats: Command[] = conversations.map((c) => ({
      id: `chat-${c.id}`,
      label: c.title,
      hint: "chat",
      run: wrap(() => onSelectChat(c.id)),
    }));
    return [...base, ...chats];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint.includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-paper2 shadow-2xl overflow-hidden animate-fade-up">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Jump to a chat, panel, chain, or action…"
          aria-label="Command palette"
          className="w-full bg-transparent px-4 py-3.5 text-[14px] border-b border-line/70 outline-none placeholder:text-ink3"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-ink3">No matches.</li>
          )}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => c.run()}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                  i === active ? "bg-haze" : ""
                }`}
              >
                <span className="text-[13px] text-ink flex-1 min-w-0 truncate">{c.label}</span>
                <span
                  className={`font-mono text-[9px] uppercase tracking-label ${
                    c.hint === "danger" ? "text-neg" : "text-ink3"
                  }`}
                >
                  {c.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
