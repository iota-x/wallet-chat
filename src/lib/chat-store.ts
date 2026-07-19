import type { UIMessage } from "ai";
import type { Chain, Mode } from "./types";

/**
 * Client-side conversation store (localStorage). No backend — chats live in the
 * browser, keyed by a single JSON blob. Each conversation remembers the chain
 * and network tier it was held on, so re-opening it restores that context.
 */

export interface Conversation {
  id: string;
  title: string;
  chain: Chain;
  mode: Mode;
  owner: string | null;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
}

const KEY = "wc-conversations-v1";

function read(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Conversation[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / disabled — ignore */
  }
}

export function listConversations(): Conversation[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function newConversation(ctx: {
  chain: Chain;
  mode: Mode;
  owner: string | null;
}): Conversation {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    title: "New chat",
    chain: ctx.chain,
    mode: ctx.mode,
    owner: ctx.owner,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
}

export function upsertConversation(conv: Conversation) {
  const list = read();
  const i = list.findIndex((c) => c.id === conv.id);
  if (i >= 0) list[i] = conv;
  else list.push(conv);
  write(list);
}

export function deleteConversation(id: string) {
  write(read().filter((c) => c.id !== id));
}

/** Derive a short title from the first user message. */
export function deriveTitle(messages: UIMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const text = firstUser.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();
  if (!text) return null;
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}
