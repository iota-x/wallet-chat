# WalletChat

A natural-language agent over your crypto wallet — **Solana, Ethereum, and Bitcoin**. State an
intent in plain English — _"move half my USDC into a JitoSOL position"_, _"swap 0.05 ETH into
WBTC"_, _"send 0.001 BTC to bc1…"_ — and the agent **plans** it, **simulates** it against live
chain state, and shows a **legible risk/diff preview**. Nothing signs until hard guardrails pass
and you click confirm. Signing is client-side only; the server never sees a key.

**Chains**
- **Solana** — full pipeline: simulate + exact balance-diff decode, transfers, Jupiter swaps.
  Devnet executes end-to-end; mainnet read-only.
- **Ethereum** — full pipeline: `eth_simulateV1` + exact diff decode (Multicall3 post-state read),
  ETH/ERC-20 transfers, KyberSwap swaps, MetaMask signing. Sepolia executes; mainnet read-only.
- **Bitcoin** — lighter by nature (UTXO chains have no simulation or DEX): real PSBT build with
  coin selection, fee estimate, and exact input/output preview, Unisat signing. Honest about the
  weaker guarantees — see [`DECISION_LOG.md`](./DECISION_LOG.md).

> The safety architecture is the point. See [`DECISION_LOG.md`](./DECISION_LOG.md) for the threat
> model, the delegated design decisions, and the proof-of-correctness output.

---

## Hard invariants (enforced, not aspirational)

1. **Simulate before sign.** A plan is `signable` only if simulation succeeded — and the client
   re-simulates against fresh state immediately before signing. No bypass path.
2. **Keys never reach the server.** Signing happens in the browser wallet. The server has no
   keypair and no submit path; its tools are read/plan/simulate only.
3. **The agent never auto-signs.** Every state change is an explicit human click.
4. **Guardrails gate confirm.** The confirm button is bound to `plan.signable =
   sim.success && guardrail.pass && modeAllowsSigning(mode)`, derived in one place.
5. **Two modes.** `devnet` executes end-to-end; `mainnet` is read-only (real reads, plans, sims,
   and the real diff — signing disabled).

## Architecture at a glance

```
src/lib/solana/
  tokens.ts      hand-rolled SPL 165-byte layout decode (amount as bigint)
  simulate.ts    ★ simulate + EXACT post-sim balance-diff decode (the crown jewel)
  build.ts       unsigned v0 transaction builders (transfer, wrap) — never signs
  inspect.ts     program-id resolution through address lookup tables; fee breakdown
src/lib/guardrails/
  policy.ts      ★ dependency-free, unit-tested security policy (caps/allowlist/slippage/staleness)
src/lib/agent/
  balances.ts    read SOL + all SPL balances, priced
  plan.ts        ★ assemblePlan(): build→inspect→sim→decode→price→fee→guardrail→signable
  tools.ts       AI SDK v6 tools (read/quote/plan). owner+mode bound server-side, not by the model
src/lib/jupiter.ts   quotes + swap tx (JitoSOL = output mint; see DECISION_LOG 1.1)
src/app/api/agent    the bounded multi-step agent loop (model: anthropic/claude-opus-4-8)
src/app/api/resim    pre-submit re-simulation (drift defense)
src/components/
  PlanPreview.tsx ★ the signature UI: route pills, signed deltas, fees, guardrails, gated confirm
```

## Setup

```bash
npm install
cp .env.example .env.local     # then fill in the values below
```

`.env.local`:

- `AI_GATEWAY_API_KEY` — a [Vercel AI Gateway](https://vercel.com/ai-gateway) key. Routes the
  `anthropic/claude-opus-4-8` model. Required for the chat agent (not for the proof scripts).
- `NEXT_PUBLIC_DEVNET_RPC` / `NEXT_PUBLIC_MAINNET_RPC` — Solana RPC URLs. Public endpoints work
  but rate-limit hard; a Helius/Triton/QuickNode URL is strongly recommended.
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC` / `NEXT_PUBLIC_ETH_MAINNET_RPC` — Ethereum RPC URLs. Must support
  `eth_simulateV1` (publicnode defaults do; Alchemy/Infura also work).
- `NEXT_PUBLIC_DEFAULT_MODE` — `devnet` (default, = the executable test tier) or `mainnet`.

Wallets by chain: **Solana** → Phantom/Solflare (wallet-adapter); **Ethereum** → MetaMask;
**Bitcoin** → Unisat. Bitcoin/EVM prices come from DeFiLlama (keyless); Solana from Jupiter.

## Run

```bash
npm run dev        # app at http://localhost:3000
```

Connect a wallet (Phantom/Solflare), pick a mode, and state an intent. On **devnet** the confirm
flow re-simulates, signs in your wallet, submits, and links the transaction on Explorer.

## Verify (this is where the claims are backed up)

```bash
npm test            # 24 unit tests: guardrail policy + offline token-layout decode
npm run proof       # ★ Solana devnet: balance-diff decode is exact to the lamport
npm run proof:evm   # ★ Ethereum Sepolia: EVM diff decode is exact, gas folded into ETH delta
npm run verify:plan # full Solana plan pipeline (devnet transfer + mainnet read-only swap)
npm run verify:evm  # full EVM plan pipeline (mainnet read-only swap; Sepolia transfer if funded)
```

`npm run proof` needs a funded devnet keypair. If the public faucet is dry, pass one:

```bash
PROOF_PAYER_SECRET="$(cat ~/.config/solana/id.json)" npm run proof
```

Sample proof output and the mainnet read-only demonstration are pasted in
[`DECISION_LOG.md` §5](./DECISION_LOG.md#5-proof-it-works).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Vercel AI SDK v6 (`anthropic/claude-opus-4-8`
via AI Gateway) · `@solana/web3.js` + `spl-token` · Jupiter (quotes/swaps) ·
`@solana/wallet-adapter` (client-side signing) · Vitest.
