"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";
import type { Chain, Mode } from "@/lib/types";
import {
  type Conversation,
  listConversations,
  newConversation,
  upsertConversation,
  deleteConversation,
  setPinned,
  deriveTitle,
} from "@/lib/chat-store";

export interface ChatContext {
  chain: Chain;
  mode: Mode;
  owner: string | null;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount, dropping empty chats so history stays
  // clean (an unused "New chat" doesn't survive a refresh).
  useEffect(() => {
    const all = listConversations();
    all.filter((c) => c.messages.length === 0).forEach((c) => deleteConversation(c.id));
    const kept = all.filter((c) => c.messages.length > 0);
    setConversations(kept);
    setActiveId(kept[0]?.id ?? null);
    setHydrated(true);
  }, []);

  const refresh = useCallback(() => setConversations(listConversations()), []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  /** Start a fresh chat. Kept in memory only — it is persisted the moment it
   * gets its first message (so an unused "New chat" never enters history).
   * Reuses an existing empty one to avoid stacking. */
  const newChat = useCallback(
    (ctx: ChatContext) => {
      const empty = conversations.find((c) => c.messages.length === 0);
      if (empty) {
        setActiveId(empty.id);
        return empty.id;
      }
      const conv = newConversation(ctx);
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      return conv.id;
    },
    [conversations]
  );

  const select = useCallback((id: string) => setActiveId(id), []);

  const remove = useCallback(
    (id: string) => {
      deleteConversation(id);
      const list = listConversations();
      setConversations(list);
      setActiveId((cur) => (cur === id ? list[0]?.id ?? null : cur));
    },
    []
  );

  const rename = useCallback((id: string, title: string) => {
    const conv = listConversations().find((c) => c.id === id);
    if (!conv) return;
    upsertConversation({ ...conv, title: title.trim() || conv.title, updatedAt: Date.now() });
    setConversations(listConversations());
  }, []);

  const togglePin = useCallback((id: string) => {
    const conv = listConversations().find((c) => c.id === id);
    if (!conv) return;
    setPinned(id, !conv.pinned);
    setConversations(listConversations());
  }, []);

  /** Persist a conversation's messages (called when a turn completes). */
  const saveMessages = useCallback(
    (id: string, messages: UIMessage[], ctx: ChatContext) => {
      const existing =
        listConversations().find((c) => c.id === id) ??
        newConversation(ctx);
      const titled =
        existing.title === "New chat"
          ? deriveTitle(messages) ?? existing.title
          : existing.title;
      upsertConversation({
        ...existing,
        id,
        messages,
        title: titled,
        chain: ctx.chain,
        mode: ctx.mode,
        owner: ctx.owner,
        updatedAt: Date.now(),
      });
      setConversations(listConversations());
    },
    []
  );

  return {
    conversations,
    activeId,
    active,
    hydrated,
    newChat,
    select,
    remove,
    rename,
    togglePin,
    saveMessages,
    refresh,
  };
}
