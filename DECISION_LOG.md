# WalletChat — Decision Log

**To the building agent:** fill every section before you call the build done. Be specific and
honest — "N/A" is only acceptable with a reason. A human reviewer will check this against the
actual code.

**Reviewer quick-scan — 5 red flags that mean "happy path only":**
1. No devnet proof that the balance-diff decode is exactly right.
2. Confirm button not provably bound to guardrail `pass`.
3. Quotes/sims used once, never re-checked before submit (ignores drift).
4. Guardrail logic scattered in UI handlers instead of a standalone tested module.
5. Section 4 says "nothing bent" but the hard invariants aren't actually all enforced.

**Status against those 5 flags:**
1. Addressed — `scripts/prove-diff-decode.ts` (`npm run proof`) asserts the decode to the
   lamport/base-unit against live devnet. Output pasted in §5.
2. Addressed — the confirm button's `disabled` is derived from `plan.signable`, which is
   `sim.success && guardrail.pass && modeAllowsSigning(mode)` computed in exactly one place
   (`src/lib/agent/plan.ts` → `assemblePlan`). See §2.
3. Addressed — `POST /api/resim` re-runs the whole pipeline against fresh state immediately
   before signing; a stale quote is a hard-block guardrail. See §3, bullet 1.
4. Addressed — `src/lib/guardrails/policy.ts` is dependency-free and unit-tested
   (`test/guardrails.test.ts`, 19 tests). The UI reads `pass`; it re-implements nothing.
5. See §4 — no hard invariant bent.

---

## 1. Delegated architecture decisions

### 1.1 JitoSOL — swap vs native stake-pool deposit
- **Decision:** Jupiter **swap** with JitoSOL as the output mint.
- **Tradeoff weighed:** A native Solana stake-pool *deposit* instruction can occasionally price
  marginally better (no DEX hop, no pool slippage) and is the "purest" way to mint JitoSOL. But
  it forks the entire pipeline for a single asset: a bespoke instruction builder, a bespoke diff
  expectation, and guardrail special-casing. Treating "acquire asset X" uniformly as a swap means
  the *same* simulate → decode → guardrail path covers SOL→JitoSOL, USDC→JitoSOL, and every other
  intent, and the decoder/policy never learn about staking. Jupiter also routes *through* the
  stake pool when that's the best price, so we rarely leave value on the table. The correctness
  and safety win of one code path outweighs a few bps.
- **Reviewer check:** `src/lib/jupiter.ts` builds a standard Jupiter swap; JitoSOL is just
  `TOKENS.JitoSOL.mints.mainnet` passed as `outputMint`. No stake-pool deposit instruction exists
  in the code — consistent with the "swap" claim.

### 1.2 Agent shape — single tool-loop vs plan/execute split
- **Decision:** **Plan/execute split.** The server-side agent (AI SDK v6 multi-step tool loop) is
  strictly read/plan/simulate; it emits a typed `Plan`. Execution (signing + submitting) is a
  separate client-only step gated on human confirmation.
- **Rationale:** The hard invariants ("keys never reach the server", "agent never auto-signs")
  are structural, not behavioural, under this split: there is literally no signing capability in
  the server tool set, so no prompt can make the model sign. A single loop that could both plan
  and execute would put the safety burden on the model's behaviour — the wrong place.
- **Reviewer check:** Loop is bounded — `stopWhen: stepCountIs(8)` in `src/app/api/agent/route.ts`.
  It can terminate without a plan (e.g. it asks a clarifying question, or a tool returns `{error}`).
  Tools live in `src/lib/agent/tools.ts`; none sign or submit.

### 1.3 Server/client plan boundary
- **Decision (what crosses the wire, typed how):** A single `Plan` object (`src/lib/types.ts`),
  streamed as the tool-result part of the assistant message. It carries: the unsigned base64
  `VersionedTransaction`, the `SimulationResult`, the exact decoded `AssetDelta[]`, the itemized
  `FeeBreakdown`, the optional `SwapRoute`, the quote `Freshness` envelope, the full
  `GuardrailReport`, and the derived `signable` boolean.
- **Rationale:** The UI renders structured fields; it never parses prose. The model is explicitly
  told the preview carries the numbers, so it doesn't restate them. `owner` and `mode` are on the
  Plan so the client can verify the connected wallet matches before signing.
- **Reviewer check:** `src/components/PlanPreview.tsx` consumes typed fields only. The agent's
  system prompt (`route.ts`) says "The UI renders the Plan … you do NOT need to restate the
  numbers." No JSON-in-text parsing anywhere.

---

## 2. Threat model & guardrails
- **Assets at risk:** The connected wallet's SOL and SPL tokens (its signing authority).
- **Untrusted inputs (LLM output, quotes, RPC responses, user text):**
  - *LLM tool calls* — could propose a transfer to an attacker, an unbounded amount, or an
    unknown/drainer program.
  - *Jupiter/DEX quote* — could misreport price or hide ruinous price impact.
  - *RPC responses* — could be stale.
  - *User text* — fat-finger on a large amount.
- **Controls implemented and WHERE enforced** (all in `src/lib/guardrails/policy.ts`, evaluated
  in `assemblePlan`):
  - **sim-must-pass** (block) — `simulation.success` must be true.
  - **program-allowlist** (block) — every invoked program, *resolved through address lookup
    tables* (`src/lib/solana/inspect.ts`), must be in the allowlist.
  - **spend-cap** (block) — net outflow capped in **USD *and* raw SOL**, so breaking/omitting the
    price oracle cannot unlock an unlimited spend.
  - **slippage-ceiling** (block) and **price-impact** (block above 5%, warn above 1%) — swaps.
  - **quote-freshness** (block) — quote age over the policy ceiling blocks signing.
  - **typed-confirmation** — large-value outflows require typing an exact phrase.
- **What a rogue LLM or malicious quote CANNOT cause, and why:** It cannot produce a `signable`
  plan that (a) didn't simulate successfully, (b) touches a non-allowlisted program, (c) exceeds
  the spend cap (USD *or* SOL), or (d) rests on a stale quote — each is a `block`-severity check,
  and `pass` is false if any block check fails. `signable = sim.success && guardrail.pass &&
  modeAllowsSigning(mode)` is the *only* way a plan becomes signable, and the client re-derives it
  and re-simulates before signing.
- **Reviewer check — trace one path:** Can ANY code submit a transaction without a passing
  simulation and a human click? **No.** The only submit call is
  `connection.sendRawTransaction` in `PlanPreview.onConfirm`, reached only after: a human click →
  `/api/resim` returns a plan with `signable === true` → `signTransaction` (wallet prompt). The
  server has no signing key and no submit path.

---

## 3. Correctness traps — handled?
- [x] **Simulation vs execution drift (re-sim before submit? quote TTL?):** Yes. `/api/resim`
  (`src/app/api/resim/route.ts` → `resimulatePlan`) re-runs build-free simulation + decode +
  guardrails against fresh state right before signing; if `signable` flips to false the UI refuses
  and shows the updated preview. Quotes carry a `Freshness{fetchedAt, ttlMs}`; the guardrail clamps
  TTL to a 30s policy ceiling and hard-blocks a stale quote. `replaceRecentBlockhash: true` means
  every (re)sim runs against a current blockhash.
- [x] **Post-sim balance-diff decode (token layout, decimals) — exact?:** Yes, and proven.
  `src/lib/solana/simulate.ts` decodes from simulated post-account-state vs live pre-state;
  `src/lib/solana/tokens.ts` decodes the 165-byte SPL layout by hand (amount as `bigint`, never a
  lossy JS number). Proven exact on devnet (§5) and unit-tested offline (`test/token-decode.test.ts`).
- [x] **Wrapped SOL (wrap/unwrap):** Handled. Native SOL and wSOL share a mint address; a
  `native` discriminator on `WatchedAsset` lets us watch the wSOL *token account* separately from
  the owner's system-account lamports, so wrap/unwrap nets out correctly. Jupiter swaps set
  `wrapAndUnwrapSol: true` and the diff reflects the resulting movement. `buildWrap` exists in
  `src/lib/solana/build.ts`.
- [x] **ATA creation + rent reflected in the diff:** Yes. ATA creation is detected structurally
  (pre-account null, post-account a live token account → `ataCreated: true`), and the rent shows
  up in the fee payer's native-SOL delta. Proven on devnet: fee payer SOL delta ==
  `-(fee + 2039280)` when funding a new recipient ATA.
- [x] **Versioned transactions + address lookup tables:** All transactions are v0
  `VersionedTransaction`. LUTs are resolved in `extractProgramIds` (fetch tables →
  `getAccountKeys({ addressLookupTableAccounts })`) so the allowlist sees Jupiter's LUT-hidden
  programs. Verified: the mainnet swap's program-allowlist check passes with "All 3 program(s)
  allowlisted" (§5).
- [x] **Compute budget / priority fees:** Transfers/wraps set explicit
  `ComputeBudgetProgram.setComputeUnitLimit` + `setComputeUnitPrice`; Jupiter swaps use
  `dynamicComputeUnitLimit` + auto prioritization. `FeeBreakdown` splits base vs priority vs rent.
- [x] **Slippage + price impact surfaced to the user:** `SwapRoute` carries `slippageBps`,
  `priceImpactPct`, and `otherAmountThreshold` (min received); the preview shows all three, the
  guardrail enforces a slippage ceiling and a price-impact block/warn.
- **Reviewer check:** `npm run proof` prints the devnet assertions (§5). `npm run verify:plan`
  exercises the whole assembly pipeline on both networks.

---

## 4. What I bent or left out
- **Invariants bent (should be NONE of the hard 5 — if any, flag loudly here):** **None.** All
  five hold: simulate-before-sign (no submit path without a passing re-sim), keys never reach the
  server (client-only signing; server has no keypair), agent never auto-signs (server tools are
  read/plan/simulate only), guardrails gate the confirm affordance (`signable` derivation), and
  the devnet/mainnet split is enforced by `modeAllowsSigning`.
- **Known limitations:**
  - The agent requires `AI_GATEWAY_API_KEY`; without it the route returns a clear 500 (no silent
    fallback). The rest of the app (balances, plan assembly, sim, guardrails) is independently
    exercisable via the scripts.
  - USD pricing is best-effort via Jupiter's price API; when unavailable, values render as
    "unpriced" and the raw-SOL spend cap is what protects the user (by design).
  - The public devnet/mainnet RPCs rate-limit aggressively; a dedicated RPC (Helius/Triton) is
    recommended via `NEXT_PUBLIC_*_RPC`. The proof script accepts `PROOF_PAYER_SECRET` to sidestep
    the faucet.
  - Token registry is curated (SOL/USDC/JitoSOL/USDT/BONK). Unknown mints still appear in balances
    and diffs (shortened address, on-chain decimals), just without a friendly symbol.
  - Mainnet is read-only *by design* for this showcase; a passing mainnet swap *simulation*
    requires a wallet that actually holds the input token.
- **TODOs a production version needs:** priority-fee estimation from recent slots; partial-fill
  handling for swaps; a persisted, signed audit log of plans; per-session spend budgets;
  Token-2022 transfer-fee/hook awareness in the decode; multi-sig / hardware-wallet flows.

---

## 4b. Multi-chain extension (Ethereum + Bitcoin)

The app was extended beyond Solana. The design principle: **preserve the safety thesis where the
chain allows it, and be honest where it doesn't.**

### Ethereum (full rigor)
- **Same pipeline, same invariants.** `src/lib/evm/plan.ts` mirrors the Solana `assemblePlan`:
  build unsigned tx → simulate → decode exact diff → price → guardrails → `signable =
  sim.success && guardrail.pass && modeAllowsSigning`. Signing is client-side via MetaMask
  (`eth_sendTransaction`); the server holds no key.
- **Exact diff decode, not quote-trusting.** `src/lib/evm/simulate.ts` uses `eth_simulateV1`:
  it reads the owner's balances (native + ERC-20) via Multicall3 *inside the simulated block,
  right after the tx*, and diffs against a live pre-read. Two details make it exact: `validation:
  true` charges gas to the sender (so the ETH delta folds in gas, like Solana's fee), and the
  post-read call is sent from a balance-overridden throwaway address so its own gas can't perturb
  the owner. **Proven on Sepolia** (`npm run proof:evm`, output in §5).
- **Guardrails reuse the tested policy.** The same `evaluateGuardrails` runs, with an EVM
  allowlist (curated token contracts + known DEX routers — anything else is blocked, fail-safe),
  wei-denominated caps, and LUT-free program targets = the contract addresses the tx calls.
- **Swaps** go through KyberSwap's keyless aggregator (mainnet), the ETH↔token analog of the
  JitoSOL scenario. Networks: Sepolia executes end-to-end; mainnet is read-only.

### Bitcoin (lighter, by necessity — flagged honestly)
- UTXO chains have **no on-chain simulation and no DEX**, so there is **no exact post-state diff
  and no swaps**. Claiming otherwise would be dishonest. What Bitcoin *does* get:
  `src/lib/btc/build.ts` selects confirmed UTXOs, builds a real PSBT (native SegWit **and Taproot**
  key-path senders), and previews **exactly which inputs are spent and which outputs (recipient +
  change) are created**, with the fee. Taproot inputs set `tapInternalKey` from the wallet's public
  key (threaded from Unisat's `getPublicKey`, since a P2TR address alone can't yield the internal
  key). Signing is client-side via Unisat.
- Guardrails are **construction-based** (`src/lib/btc/plan.ts`): PSBT constructed & funded, spend
  cap (BTC + USD), fee-sanity (blocks a fee > 50% of the send), dust avoidance — and the "guardrails
  gate confirm" invariant still holds (`signable = pass && modeAllowsSigning`). The preview and the
  agent both state plainly that this is PSBT-derived, not simulated.
- **Drift defense:** the re-sim endpoint rebuilds the PSBT against the current UTXO set before
  signing, which catches already-spent inputs.

### Where the boundary sits
`Plan` is generalized (`chain`, `nativeSymbol/Decimals`, and per-chain payloads: Solana
`transactionBase64`, `evmTx`, or `btc` PSBT). The agent route binds tools + owner + network per
chain from the request; the model cannot pick the chain, wallet, or tier.

---

## 5. Proof it works
- **Devnet end-to-end (`npm run proof`, `npm run verify:plan`):**
  ```
  TEST 1 — native SOL transfer (fee + amount exact)
    ✓ simulation succeeded
    ✓ SOL delta == -(amount + fee) = -(100000000 + 5000)
  TEST 2–4 — SPL transfer + ATA creation (sender, receiver, rent)
    ✓ simulation succeeded
    ✓ sender token delta == -amount
    ✓ sender SOL delta == -(fee + rent) = -(5000 + 2039280)
    ✓ receiver token delta == +amount
    ✓ receiver ATA creation detected
  ALL PROOFS PASSED — the diff decode is exact.

  TEST A — devnet SOL transfer plan
    sim.success: true   SOL uiDelta: -0.0100054   guardrail.pass: true   signable: true
  ```
  Full signed-execution (signature) happens in the browser via the connected wallet on devnet;
  the confirm flow re-simulates, signs client-side, submits, and links the Explorer tx.
- **Ethereum Sepolia (`npm run proof:evm`):** exact EVM diff decode, self-contained (state
  overrides + real WETH, no faucet/key):
  ```
  gasUsed 27938  baseFee 1023662389  gasCost 56537079823882
    ✓ WETH(owner) delta == +100000000000000000 (wrapped)
    ✓ ETH(owner)  delta == -(X + gas) = -(100000000000000000 + 56537079823882)
  EVM PROOF PASSED — diff decode is exact, gas folded into native delta.
  ```
  And `npm run verify:evm` assembles a live mainnet ETH→USDC KyberSwap plan (router allowlisted,
  `signable=false`). Bitcoin: `assembleBtcPlan` builds a real PSBT with exact in/out preview;
  signing via Unisat on testnet.
- **Mainnet read-only (`npm run verify:plan`, TEST B):** Live Jupiter quote
  `USDC → SOL → JitoSOL` (BisonFi, Whirlpool), price impact ~0.03%, program-allowlist check passes
  with LUT-resolved programs, `sim` runs against real state, and `signable === false` — signing is
  disabled by the mainnet invariant.
- **Guardrail tests (`npm test`):** 24 tests pass. Coverage: sim-must-pass block; unknown/drainer
  program block; every default program allowlisted; USD spend-cap block; **raw-SOL cap holds even
  when the price is null (price-lie defense)**; inflows don't count against the cap; slippage-ceiling
  block; ruinous price-impact block; tolerable price-impact warn (not block); stale-quote block;
  over-generous TTL clamped to policy; typed-confirmation required for large USD and large unpriced
  SOL; never demanded on a blocked plan; policy is pure/deterministic/non-mutating; plus offline
  token-layout decode (large-u64 exactness, zero vs null, uninitialized, short buffer, wSOL reserve).
