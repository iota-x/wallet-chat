import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { PublicKey } from "@solana/web3.js";
import type { Mode } from "@/lib/types";
import { getConnection } from "@/lib/solana/connection";
import { createTools, modeExecutes } from "@/lib/agent/tools";
import { resolveModel, hasModelCredential } from "@/lib/agent/model";

export const runtime = "nodejs";
export const maxDuration = 60;

function systemPrompt(mode: Mode): string {
  const modeLine = modeExecutes(mode)
    ? "You are on DEVNET: plans can be executed end-to-end after the user confirms and signs locally."
    : "You are on MAINNET (read-only demo): reads, quotes, simulation and the real diff are live, but signing is DISABLED. Never imply a mainnet action was executed.";
  return `You are WalletChat, a careful assistant that operates over the user's Solana wallet by turning plain-language intents into simulated, guardrailed transaction plans.

${modeLine}

Hard rules you must never break:
- You NEVER sign or submit anything. Your tools only read, plan, and simulate. Signing happens client-side, only after the human clicks confirm, and only when guardrails pass.
- Ground every amount in real balances. For anything like "half my USDC" or "all my SOL", call read_balances first, then pass a fraction to the plan tool. Do not invent balances.
- To act, produce a Plan via build_transfer_plan or build_swap_plan. The UI renders the Plan (route, deltas, fees, guardrails) — you do NOT need to restate the numbers in prose.
- JitoSOL is acquired as a Jupiter swap with JitoSOL as the output mint.
- If a tool returns an error, explain it plainly and suggest a fix. Never pretend a plan succeeded.

Style: concise and calm. One or two sentences before/after a plan is enough — the preview carries the detail. If the user's intent is ambiguous (missing destination, token, or amount), ask one clarifying question instead of guessing.`;
}

export async function POST(req: Request) {
  let body: {
    messages?: UIMessage[];
    mode?: Mode;
    owner?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = body.messages ?? [];
  const mode: Mode = body.mode === "mainnet" ? "mainnet" : "devnet";

  if (!body.owner) {
    return Response.json(
      { error: "Connect a wallet first — no owner public key was provided." },
      { status: 400 }
    );
  }
  let owner: PublicKey;
  try {
    owner = new PublicKey(body.owner);
  } catch {
    return Response.json({ error: "Invalid owner public key." }, { status: 400 });
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

  const connection = getConnection(mode);
  const tools = createTools({ connection, mode, owner });
  const modelMessages = await convertToModelMessages(messages);
  const { model } = resolveModel();

  const result = streamText({
    model,
    system: systemPrompt(mode),
    messages: modelMessages,
    tools,
    // Bounded loop: read → (quote) → plan, with room for a clarifying step.
    // It can always terminate without producing a plan (e.g. by asking).
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
