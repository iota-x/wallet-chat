import type { Chain, Mode } from "@/lib/types";
import { fetchActualDeltas } from "@/lib/reconcile-fetch";

export const runtime = "nodejs";
export const maxDuration = 20;

/** POST /api/reconcile — the actual on-chain movement for a confirmed tx, so the
 * client can diff it against the simulated prediction. */
export async function POST(req: Request) {
  let body: { chain?: Chain; mode?: Mode; signature?: string; owner?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const chain: Chain =
    body.chain === "ethereum" || body.chain === "bitcoin" ? body.chain : "solana";
  const mode: Mode = body.mode === "mainnet" ? "mainnet" : "devnet";
  if (!body.signature || !body.owner) {
    return Response.json({ error: "Missing signature or owner." }, { status: 400 });
  }
  try {
    const actual = await fetchActualDeltas(chain, mode, body.signature, body.owner);
    return Response.json({ actual });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
