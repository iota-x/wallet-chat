import { getConnection } from "@/lib/solana/connection";
import { resimulatePlan } from "@/lib/agent/plan";
import { resimulateEvmPlan } from "@/lib/evm/plan";
import { assembleBtcPlan } from "@/lib/btc/plan";
import type { Plan } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Pre-submit re-simulation — the drift defense, dispatched per chain. The client
 * calls this immediately before signing. We re-run the whole pipeline against
 * fresh state and return an updated Plan; if it flips to non-signable, the UI
 * refuses to sign. Bitcoin has no simulation, so we rebuild the PSBT against the
 * current UTXO set (which catches spent inputs / balance changes).
 */
export async function POST(req: Request) {
  let plan: Plan;
  try {
    plan = (await req.json()) as Plan;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!plan?.owner || !plan?.chain) {
    return Response.json({ error: "Malformed plan." }, { status: 400 });
  }

  try {
    if (plan.chain === "ethereum") {
      return Response.json({ plan: await resimulateEvmPlan(plan) });
    }
    if (plan.chain === "bitcoin") {
      if (!plan.btc) throw new Error("Missing BTC payload.");
      const recipient = plan.btc.outputs.find((o) => !o.isChange);
      if (!recipient) throw new Error("No recipient output in plan.");
      const fresh = await assembleBtcPlan({
        mode: plan.mode,
        fromAddress: plan.owner,
        toAddress: recipient.address,
        amountSat: recipient.valueSat,
        feeRateSatVb: plan.btc.feeRateSatVb,
        intentSummary: plan.intentSummary,
      });
      return Response.json({ plan: fresh });
    }
    const connection = getConnection(plan.mode);
    return Response.json({ plan: await resimulatePlan(connection, plan) });
  } catch (e) {
    return Response.json(
      { error: `Re-simulation failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
