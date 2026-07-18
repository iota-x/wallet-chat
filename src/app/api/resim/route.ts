import { getConnection } from "@/lib/solana/connection";
import { resimulatePlan } from "@/lib/agent/plan";
import type { Plan } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Pre-submit re-simulation — the drift defense. The client calls this the
 * instant before it asks the wallet to sign. We re-run the whole plan pipeline
 * (simulate → decode → guardrails → signable) against fresh chain state and
 * return an updated Plan. If the chain moved (sim now fails, diff changed, or a
 * guardrail now blocks), `signable` comes back false and the UI refuses to sign.
 */
export async function POST(req: Request) {
  let plan: Plan;
  try {
    plan = (await req.json()) as Plan;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!plan?.transactionBase64 || !plan?.owner) {
    return Response.json({ error: "Malformed plan." }, { status: 400 });
  }

  try {
    const connection = getConnection(plan.mode);
    const fresh = await resimulatePlan(connection, plan);
    return Response.json({ plan: fresh });
  } catch (e) {
    return Response.json(
      { error: `Re-simulation failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
