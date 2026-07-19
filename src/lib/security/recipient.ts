/**
 * RECIPIENT SCREENING — the layer simulation can't provide.
 *
 * A transfer to the wrong address simulates perfectly: it does exactly what you
 * asked, to the wrong person. Two risks a diff can't see:
 *   1. A brand-new destination you've never sent to (worth a second look).
 *   2. Address poisoning — an attacker seeds your history with a vanity address
 *      that shares your real contact's first/last characters, betting you copy
 *      the lookalike from a truncated display. We detect a candidate that shares
 *      a known address's prefix AND suffix but is not that address.
 *
 * Pure and dependency-free: takes the recipient + your known addresses and
 * returns a verdict. The known set (address book + past recipients) is inherently
 * client-side state, so this runs in the client just before signing.
 */

export interface KnownAddress {
  label: string;
  address: string;
}

export type RecipientVerdict =
  | { level: "known"; label: string }
  | { level: "new" }
  | { level: "poisoning"; lookalike: string; label: string };

/** Strip a leading 0x so the shared "0x" doesn't inflate a prefix match. */
function core(addr: string): string {
  const a = addr.trim().toLowerCase();
  return a.startsWith("0x") ? a.slice(2) : a;
}

// Chars of prefix + suffix an attacker must forge to fool a truncated display.
// Random collision odds at 4+4 hex are ~16^-8 (~2e-10): a match on a *different*
// full address is essentially always an intentional lookalike.
const EDGE = 4;

export function screenRecipient(
  recipient: string,
  known: KnownAddress[]
): RecipientVerdict {
  const r = recipient.trim();
  const rl = r.toLowerCase();
  const rc = core(r);

  for (const k of known) {
    if (k.address.trim().toLowerCase() === rl) {
      return { level: "known", label: k.label };
    }
  }

  if (rc.length >= EDGE * 2) {
    for (const k of known) {
      const kc = core(k.address);
      if (kc.length < EDGE * 2) continue;
      const sharesEdges =
        kc.slice(0, EDGE) === rc.slice(0, EDGE) &&
        kc.slice(-EDGE) === rc.slice(-EDGE);
      if (sharesEdges) {
        return { level: "poisoning", lookalike: k.address, label: k.label };
      }
    }
  }

  return { level: "new" };
}
