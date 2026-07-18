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

---

## 1. Delegated architecture decisions

### 1.1 JitoSOL — swap vs native stake-pool deposit
- **Decision:**
- **Tradeoff weighed:**
- **Reviewer check:** does the code match the claim? "Swap" → JitoSOL is just another output
  mint. "Native" → there's a real stake-pool deposit instruction.

### 1.2 Agent shape — single tool-loop vs plan/execute split
- **Decision:**
- **Rationale:**
- **Reviewer check:** is the loop bounded (max steps)? Can it terminate without a plan?

### 1.3 Server/client plan boundary
- **Decision (what crosses the wire, typed how):**
- **Rationale:**
- **Reviewer check:** is the plan a typed object, not prose the UI has to parse?

---

## 2. Threat model & guardrails
- **Assets at risk:**
- **Untrusted inputs (LLM output, quotes, RPC responses, user text):**
- **Controls implemented and WHERE enforced (cap / allowlist / slippage / sim-must-pass):**
- **What a rogue LLM or malicious quote CANNOT cause, and why:**
- **Reviewer check:** trace one path — can ANY code submit a transaction without a passing
  simulation and a human click? (Answer must be no.)

---

## 3. Correctness traps — handled?
For each: how you handled it, or explicitly why you chose not to.
- [ ] Simulation vs execution drift (re-sim before submit? quote TTL?):
- [ ] Post-sim balance-diff decode (token layout, decimals) — exact?:
- [ ] Wrapped SOL (wrap/unwrap):
- [ ] ATA creation + rent reflected in the diff:
- [ ] Versioned transactions + address lookup tables:
- [ ] Compute budget / priority fees:
- [ ] Slippage + price impact surfaced to the user:
- **Reviewer check:** the balance-diff decode has a devnet script/test proving it's exact.

---

## 4. What I bent or left out
- **Invariants bent (should be NONE of the hard 5 — if any, flag loudly here):**
- **Known limitations:**
- **TODOs a production version needs:**

---

## 5. Proof it works
- **Devnet end-to-end:** intent run, sim result, diff shown, execution signature:
- **Mainnet read-only:** what was simulated, confirmation signing is disabled:
- **Guardrail tests:** what's covered:
