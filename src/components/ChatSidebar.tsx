"use client";

import React, { useState } from "react";
import type { Conversation } from "@/lib/chat-store";
import { CHAINS } from "@/lib/chains";

type Panel = "portfolio" | "transactions" | "addresses" | "approvals" | "settings";

/** Conversation history sidebar — new chat, tools, search, pin, rename, switch. */
export function ChatSidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onOpen,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onOpen: (panel: Panel) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const tools: { key: Panel; icon: string; label: string }[] = [
    { key: "portfolio", icon: "◵", label: "portfolio" },
    { key: "transactions", icon: "⇄", label: "transactions" },
    { key: "addresses", icon: "☷", label: "addresses" },
    { key: "approvals", icon: "⊠", label: "approvals" },
    { key: "settings", icon: "⛭", label: "guardrails" },
  ];

  const filtered = query.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
    : conversations;

  function commitRename(id: string) {
    if (draft.trim()) onRename(id, draft.trim());
    setEditing(null);
  }

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

      {conversations.length > 3 && (
        <div className="px-3 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            aria-label="Search conversations"
            className="w-full rounded-lg bg-paper border border-line px-2.5 py-1.5 text-[12px] focus:border-magenta"
          />
        </div>
      )}

      <div className="px-3 pb-1">
        <span className="eyebrow">history</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-ink3">
            {query ? "No matches." : "No conversations yet."}
          </p>
        )}
        {filtered.map((c) => {
          const active = c.id === activeId;
          return (
            <div
              key={c.id}
              onClick={() => editing !== c.id && onSelect(c.id)}
              className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                active ? "bg-haze" : "hover:bg-haze/60"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(c.id);
                }}
                aria-label={c.pinned ? "Unpin" : "Pin"}
                className={`shrink-0 font-mono text-[10px] transition-opacity ${
                  c.pinned ? "text-magenta opacity-100" : "text-ink3 opacity-0 group-hover:opacity-100 hover:text-ink"
                }`}
              >
                {c.pinned ? "★" : "☆"}
              </button>
              {editing === c.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(c.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 rounded bg-paper border border-magenta px-1.5 py-0.5 text-[13px]"
                />
              ) : (
                <span
                  className={`flex-1 min-w-0 truncate text-[13px] ${active ? "text-ink" : "text-ink2"}`}
                  title={c.title}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditing(c.id);
                    setDraft(c.title);
                  }}
                >
                  {c.title}
                </span>
              )}
              {editing !== c.id && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(c.id);
                      setDraft(c.title);
                    }}
                    aria-label="Rename conversation"
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-ink3 hover:text-ink transition-opacity font-mono text-[10px]"
                  >
                    ✎
                  </button>
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
                </>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
