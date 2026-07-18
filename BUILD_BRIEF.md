# WalletChat — Build Brief (for Opus)

Build "WalletChat" — a natural-language agent over a Solana wallet. The user states an
intent ("move half my USDC into a JitoSOL position"); the agent plans it, simulates it
against real chain state, presents a legible risk/diff preview, and signs only after
explicit human confirmation behind hard guardrails. This is a hiring showcase — the
safety architecture IS the deliverable. Build it like a product, not a demo.

You own the architecture: stack choices, file structure, tool interfaces, and how you
decompose the agent loop are yours to design. Constraints and quality bar below.

## Hard invariants (non-negotiable — these are correctness, not preference)
1. Simulate before sign. Nothing is signable unless simulation returns success. No bypass path.
2. Keys never reach the server. Signing is client-side only. Never log or serialize a secret key.
3. The agent never auto-signs. Every state-changing action is an explicit human click.
   Server-side tools are read/plan/simulate only; the only thing that submits is a client
   action taken after confirmation.
4. Guardrails gate the confirm affordance — it cannot be enabled until they pass.
5. Two modes: devnet (faucet-funded, executes end-to-end) and mainnet (read-only: reads real
   balances, plans + simulates real txns, shows the real diff, signing disabled in demo).

## The problems worth solving well (don't hand-wave these)
- Simulation != execution. A sim can pass and execution still fail because chain state moved.
  Design for this: quote TTL/staleness, re-sim before submit, honest messaging about drift.
- Correctness of the diff: decode post-simulation account state properly (token layout,
  decimals, wrapped SOL, ATA creation + rent). The balance diff must be exactly right or the
  whole premise is dead.
- Versioned transactions + address lookup tables, compute budget / priority fees, slippage
  and price-impact surfacing.
- Model the guardrail POLICY as a first-class, dependency-free, tested module: spend caps,
  program allowlist, slippage ceiling, sim-must-pass. It should read like a security control,
  not an if-statement. Show your threat model in comments.

## Decisions delegated to you (make them, then justify in DECISION_LOG.md)
- JitoSOL as a Jupiter swap vs native stake-pool deposit — pick based on the tradeoff.
- Agent framework shape: single tool-loop vs plan/execute split.
- Where the plan object boundary sits between server and client.

## Agent
Vercel AI SDK v6, model "anthropic/claude-opus-4-8" via AI Gateway. Multi-step tool loop.
Tools cover: read balances (+USD), get swap quotes/routes, build unsigned txns, simulate +
decode diff. The agent returns a structured, typed plan the client renders — never prose the
UI has to parse.

## UI — this is a design problem, solve it with taste
Clean, sleek, dark, premium. One disciplined accent, mono for all numbers. The SIGNATURE
element is the transaction preview: make the risk legible at a glance — route as connected
token pills, signed deltas (out/in) with motion, fee, price impact, and any guardrail
warnings, with confirm gated on guardrail pass and typed confirmation for large value. Design
the empty state, streaming, mobile, focus states, and reduced-motion as part of the bar, not
afterthoughts. Match the polish of a top product.

## Working method
Prove the hardest thing first — the post-sim balance-diff decode against devnet — before
building UI on top of it. Fill in DECISION_LOG.md as you go. Keep the guardrails module
tested and standalone.
