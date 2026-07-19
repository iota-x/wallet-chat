import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { PublicKey } from "@solana/web3.js";
import { isAddress, getAddress, type Address } from "viem";
import type { Mode, Chain } from "@/lib/types";
import { getConnection } from "@/lib/solana/connection";
import { createTools, modeExecutes } from "@/lib/agent/tools";
import { createEvmTools } from "@/lib/agent/evm-tools";
import { createBtcTools } from "@/lib/agent/btc-tools";
import { resolveModel, hasModelCredential } from "@/lib/agent/model";
import { CHAINS, networkName } from "@/lib/chains";
import { type PolicyOverride, sanitizePolicyOverride } from "@/lib/guardrails/policy";

export const runtime = "nodejs";
export const maxDuration = 60;

function systemPrompt(
  chain: Chain,
  mode: Mode,
  addressBook: { label: string; address: string }[]
): string {
  const meta = CHAINS[chain];
  const bookLine =
    addressBook.length > 0
      ? `\n\nSaved addresses for this wallet (when the user names one, use its ADDRESS as the destination, never the label):\n${addressBook
          .map((e) => `- ${e.label} = ${e.address}`)
          .join("\n")}`
      : "";
  const modeLine = modeExecutes(mode)
    ? `You are on ${networkName(chain, mode)} (the executable test tier): plans can be executed end-to-end after the user confirms and signs locally.`
    : `You are on ${meta.label} ${networkName(chain, mode)} (read-only demo): reads, quotes, simulation and the real diff are live, but signing is DISABLED. Never imply an action was executed.`;
  const swapLine = meta.supportsSwap
    ? chain === "solana"
      ? "- JitoSOL is acquired as a Jupiter swap with JitoSOL as the output mint."
      : "- Swaps go through the KyberSwap aggregator (mainnet only)."
    : "- This chain has no swaps; only transfers are supported.";
  const simLine = meta.supportsSimulation
    ? "The plan is simulated against live chain state and the exact balance diff is decoded."
    : "Bitcoin has no on-chain simulation; the plan previews the PSBT inputs/outputs and fee (be honest about this).";
  return `You are WalletChat, a careful assistant operating over the user's ${meta.label} wallet by turning plain-language intents into guardrailed transaction plans. ${simLine}

${modeLine}

Hard rules you must never break:
- You NEVER sign or submit anything. Your tools only read, plan, and simulate. Signing happens client-side, only after the human clicks confirm, and only when guardrails pass.
- Ground every amount in real balances. For "half my USDC" or "all my ETH", call read_balances first, then pass a fraction to the plan tool. Do not invent balances.
- To act, produce a Plan via build_transfer_plan${meta.supportsSwap ? " or build_swap_plan" : ""}. The UI renders the Plan (deltas, fees, guardrails) — do NOT restate the numbers in prose.
${swapLine}
- A destination may be an address OR a name (name.eth on Ethereum, name.sol on Solana). Pass whatever the user says straight through as the destination; the tool resolves the name and fails clearly if it can't.
- If a tool returns an error, explain it plainly and suggest a fix. Never pretend a plan succeeded.
- The native asset here is ${meta.nativeSymbol}.

Style: concise and calm. One or two sentences around a plan is enough. If the intent is ambiguous (missing destination, token, or amount), ask one clarifying question instead of guessing.${bookLine}`;
}

function buildToolsForChain(
  chain: Chain,
  mode: Mode,
  owner: string,
  ownerPublicKey: string | null | undefined,
  policyOverride: PolicyOverride,
  allowMainnetSign: boolean
) {
  if (chain === "ethereum") {
    return createEvmTools({ mode, owner: owner as Address, policyOverride, allowMainnetSign });
  }
  if (chain === "bitcoin") {
    return createBtcTools({ mode, owner, publicKey: ownerPublicKey, policyOverride, allowMainnetSign });
  }
  return createTools({
    connection: getConnection(mode),
    mode,
    owner: new PublicKey(owner),
    policyOverride,
    allowMainnetSign,
  });
}

/** Validate the owner address for the given chain, returning a normalized form. */
function normalizeOwner(chain: Chain, owner: string): string | null {
  try {
    if (chain === "ethereum") return isAddress(owner) ? getAddress(owner) : null;
    if (chain === "bitcoin") return owner.length >= 14 ? owner : null; // shape check; builder validates precisely
    return new PublicKey(owner).toBase58();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: {
    messages?: UIMessage[];
    mode?: Mode;
    chain?: Chain;
    owner?: string;
    ownerPublicKey?: string;
    addressBook?: { label: string; address: string }[];
    policyOverride?: PolicyOverride;
    allowMainnetSign?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = body.messages ?? [];
  const mode: Mode = body.mode === "mainnet" ? "mainnet" : "devnet";
  const chain: Chain =
    body.chain === "ethereum" || body.chain === "bitcoin" ? body.chain : "solana";
  const addressBook = Array.isArray(body.addressBook) ? body.addressBook.slice(0, 50) : [];
  const policyOverride = sanitizePolicyOverride(body.policyOverride);

  if (!body.owner) {
    return Response.json(
      { error: "Connect a wallet first — no owner address was provided." },
      { status: 400 }
    );
  }
  const owner = normalizeOwner(chain, body.owner);
  if (!owner) {
    return Response.json(
      { error: `Invalid ${chain} address for the connected wallet.` },
      { status: 400 }
    );
  }

  if (!hasModelCredential()) {
    return Response.json(
      {
        error:
          "No model credential set. Add GOOGLE_GENERATIVE_AI_API_KEY (free, no card), GROQ_API_KEY (free, no card), or AI_GATEWAY_API_KEY to .env.local. See .env.example.",
      },
      { status: 500 }
    );
  }

  const tools = buildToolsForChain(
    chain,
    mode,
    owner,
    body.ownerPublicKey,
    policyOverride,
    body.allowMainnetSign === true
  );
  const modelMessages = await convertToModelMessages(messages);
  const { model } = resolveModel();

  const result = streamText({
    model,
    system: systemPrompt(chain, mode, addressBook),
    messages: modelMessages,
    tools,
    // Bounded loop: read → (quote) → plan, with room for a clarifying step.
    // It can always terminate without producing a plan (e.g. by asking).
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
