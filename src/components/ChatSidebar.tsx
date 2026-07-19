"use client";

import React from "react";
import type { Conversation } from "@/lib/chat-store";
import { CHAINS } from "@/lib/chains";

/** Conversation history sidebar — new chat, switch, delete. */
export function ChatSidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
  onOpen,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (panel: "portfolio" | "transactions" | "addresses" | "settings") => void;
}) {
  const tools: { key: "portfolio" | "transactions" | "addresses" | "settings"; icon: string; label: string }[] = [
    { key: "portfolio", icon: "◵", label: "portfolio" },
    { key: "transactions", icon: "⇄", label: "transactions" },
    { key: "addresses", icon: "☷", label: "addresses" },
    { key: "settings", icon: "⛭", label: "guardrails" },
  ];
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 space-y-2">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-magenta text-paper font-mono text-[12px] py-2.5 hover:bg-ink transition-colors"
        >
          <span className="text-sm leading-none">+</span> new chat
        </button>
        <div className="grid grid-cols-2 gap-2">
          {tools.map((t) => (
            <button
              key={t.key}
              onClick={() => onOpen(t.key)}
              className="flex items-center gap-1.5 rounded-lg border border-line text-ink2 font-mono text-[11px] px-2.5 py-2 hover:border-magenta hover:text-ink transition-colors"
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pb-1">
        <span className="eyebrow">history</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {conversations.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-ink3">No conversations yet.</p>
        )}
        {conversations.map((c) => {
          const active = c.id === activeId;
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                active ? "bg-haze" : "hover:bg-haze/60"
              }`}
            >
              <span
                className={`font-mono text-[8px] uppercase tracking-label shrink-0 rounded px-1 py-0.5 border ${
                  active ? "border-magenta/40 text-magenta" : "border-line text-ink3"
                }`}
              >
                {CHAINS[c.chain].nativeSymbol}
              </span>
              <span
                className={`flex-1 min-w-0 truncate text-[13px] ${
                  active ? "text-ink" : "text-ink2"
                }`}
                title={c.title}
              >
                {c.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                aria-label="Delete conversation"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-ink3 hover:text-neg transition-opacity font-mono text-xs w-4 h-4 grid place-items-center"
              >
                ✕
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
