import { setReconciliation, type TxRecord, type ReconcileDelta } from "./tx-store";
import { compareDeltas } from "./reconcile";

/**
 * Fetch a confirmed tx's actual movement, diff it against the prediction, and
 * persist the verdict. Shared by the transactions panel and the background
 * watcher so reconciliation runs whether or not the panel is open. `inFlight`
 * dedupes concurrent attempts on the same tx.
 */
export async function runReconcile(t: TxRecord, inFlight: Set<string>) {
  inFlight.add(t.id);
  try {
    if (t.chain === "bitcoin") {
      setReconciliation(t.id, {
        status: "unavailable",
        note: "Bitcoin has no post-state to diff — the broadcast matches the PSBT preview by construction.",
        at: Date.now(),
      });
      return;
    }
    const res = await fetch("/api/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain: t.chain, mode: t.mode, signature: t.signature, owner: t.owner }),
    });
    const data = (await res.json()) as { actual?: ReconcileDelta[] | null };
    if (!res.ok || !data.actual) return; // not indexed yet — retry next tick
    const cmp = compareDeltas(t.predicted ?? [], data.actual);
    const note =
      cmp.status === "matched"
        ? "Reality matched the simulated diff to within tolerance."
        : "Drift — " + cmp.lines.filter((l) => l.startsWith("✕")).join(" · ");
    setReconciliation(t.id, { status: cmp.status, note, at: Date.now() });
  } catch {
    /* transient — retry next tick */
  } finally {
    inFlight.delete(t.id);
  }
}
