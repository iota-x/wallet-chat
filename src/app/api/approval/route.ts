import { isAddress, getAddress, type Address } from "viem";
import type { Mode } from "@/lib/types";
import { buildEvmApproval } from "@/lib/evm/build";
import { assembleEvmPlan } from "@/lib/evm/plan";
import { evmTokenByAddress } from "@/lib/evm/constants";
import { normalizeApprovalTarget } from "@/lib/evm/allowances";
import { sanitizePolicyOverride } from "@/lib/guardrails/policy";
import { shortAddr } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/approval — build, simulate and guardrail an ERC-20 approve(spender,
 * amount) so a revoke (amount 0) or a bounded approval flows through the SAME
 * verification pipeline as any other plan: the client renders the returned Plan
 * and signs it locally. Nothing is signed here.
 */
export async function POST(req: Request) {
  let body: {
    mode?: Mode;
    owner?: string;
    token?: string;
    spender?: string;
    amount?: string; // base units; default "0" = revoke
    allowMainnetSign?: boolean;
    policyOverride?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const mode: Mode = body.mode === "mainnet" ? "mainnet" : "devnet";
  if (!body.owner || !isAddress(body.owner)) {
    return Response.json({ error: "Invalid owner address." }, { status: 400 });
  }
  const target = normalizeApprovalTarget(body.token ?? "", body.spender ?? "");
  if (!target) {
    return Response.json({ error: "Invalid token or spender address." }, { status: 400 });
  }
  let amount: bigint;
  try {
    amount = BigInt(body.amount ?? "0");
    if (amount < 0n) throw new Error();
  } catch {
    return Response.json({ error: "Invalid amount." }, { status: 400 });
  }

  const owner = getAddress(body.owner) as Address;
  const isRevoke = amount === 0n;
  const meta = evmTokenByAddress(target.token, mode);
  const sym = meta?.symbol ?? shortAddr(target.token, 4);
  const spenderShort = shortAddr(target.spender, 4);

  try {
    const built = await buildEvmApproval({
      mode,
      owner,
      token: target.token,
      spender: target.spender,
      amountBaseUnits: amount,
    });
    const plan = await assembleEvmPlan({
      mode,
      owner,
      kind: isRevoke ? "revoke" : "approve",
      intentSummary: isRevoke
        ? `Revoke ${sym} approval for ${spenderShort}`
        : `Approve ${sym} for ${spenderShort}`,
      tx: built.tx,
      watched: built.watched,
      targets: built.targets,
      route: null,
      quote: null,
      recipient: null,
      policyOverride: sanitizePolicyOverride(body.policyOverride),
      allowMainnetSign: body.allowMainnetSign === true,
    });
    return Response.json({ plan });
  } catch (e) {
    return Response.json(
      { error: `Could not build approval: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
