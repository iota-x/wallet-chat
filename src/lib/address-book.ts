import type { Chain } from "./types";

/**
 * Address book — labelled recipients per chain, in localStorage. The active
 * chain's entries are sent to the agent so intents like "send 0.1 SOL to mom"
 * resolve to the real address. Mutations dispatch an event so the chat can
 * refresh what it forwards to the agent.
 */

export interface AddressEntry {
  id: string;
  label: string;
  address: string;
  chain: Chain;
}

const KEY = "wc-address-book-v1";
const EVENT = "wc-addressbook";

function read(): AddressEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as AddressEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: AddressEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export const ADDRESS_BOOK_EVENT = EVENT;

export function listEntries(): AddressEntry[] {
  return read();
}

export function entriesForChain(chain: Chain): AddressEntry[] {
  return read().filter((e) => e.chain === chain);
}

export function addEntry(entry: Omit<AddressEntry, "id">) {
  const list = read();
  list.push({
    ...entry,
    label: entry.label.trim(),
    address: entry.address.trim(),
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `a_${Date.now()}`,
  });
  write(list);
}

export function removeEntry(id: string) {
  write(read().filter((e) => e.id !== id));
}
