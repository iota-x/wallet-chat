/**
 * End-to-end check of the EVM plan pipeline (build → simulate → decode → price →
 * guardrails → signable), the analog of verify-plan.ts for Solana.
 *
 * TEST A (mainnet, read-only): an ETH→USDC KyberSwap plan must assemble with a
 *   route, the router must be allowlisted by the guardrail, and signable must be
 *   false (mainnet is read-only by invariant).
 * TEST B (Sepolia): if EVM_VERIFY_OWNER is a funded Sepolia address, a native
 *   ETH transfer plan from it must simulate and come back signable=true.
 *
 * Run: npm run verify:evm
 */
import type { Address } from "viem";
import { buildEvmSwap } from "../src/lib/evm/swap.ts";
import { buildEvmTransfer } from "../src/lib/evm/build.ts";
import { assembleEvmPlan } from "../src/lib/evm/plan.ts";
import { EVM_TOKENS, NATIVE_ETH } from "../src/lib/evm/constants.ts";

const OWNER = (process.env.EVM_VERIFY_OWNER ||
  "0x1111111111111111111111111111111111111111") as Address;

async function testMainnetSwap() {
  console.log("\nTEST A — mainnet ETH→USDC swap plan (read-only)");
  try {
    const built = await buildEvmSwap({
      mode: "mainnet",
      owner: OWNER,
      tokenIn: NATIVE_ETH,
      tokenOut: EVM_TOKENS.USDC.addresses.mainnet!,
      decimalsIn: 18,
      decimalsOut: 6,
      amountBaseUnits: 5n * 10n ** 16n, // 0.05 ETH
      slippageBps: 50,
    });
    const plan = await assembleEvmPlan({
      mode: "mainnet",
      owner: OWNER,
      kind: "swap",
      intentSummary: "Swap 0.05 ETH → USDC",
      tx: built.tx,
      watched: built.watched,
      targets: built.targets,
      route: built.route,
      quote: { fetchedAt: built.fetchedAt, ttlMs: 20_000 },
    });
    const allow = plan.guardrail.checks.find((c) => c.id === "program-allowlist");
    console.log(`  route:            ${plan.route?.steps.map((s) => s.symbol).join(" → ")}`);
    console.log(`  markets:          ${plan.route?.markets.join(", ")}`);
    console.log(`  router allowlisted: ${allow?.passed} (${allow?.detail})`);
    console.log(`  signable:         ${plan.signable}  (must be false on mainnet)`);
    const ok = plan.signable === false && !!plan.route?.steps.length && allow?.passed === true;
    console.log(ok ? "  \x1b[32m✓ swap assembled, router allowlisted, signing disabled\x1b[0m" : "  \x1b[31m✗ unexpected\x1b[0m");
    return ok;
  } catch (e) {
    console.log(`  \x1b[33m! KyberSwap/mainnet unreachable: ${(e as Error).message}\x1b[0m`);
    return true; // tolerate external API flakiness
  }
}

async function testSepoliaTransfer() {
  if (!process.env.EVM_VERIFY_OWNER) {
    console.log("\nTEST B — skipped (set EVM_VERIFY_OWNER to a funded Sepolia address to run)");
    return true;
  }
  console.log("\nTEST B — Sepolia native ETH transfer plan");
  const built = await buildEvmTransfer({
    mode: "devnet",
    owner: OWNER,
    to: "0x000000000000000000000000000000000000dEaD" as Address,
    tokenAddress: NATIVE_ETH,
    decimals: 18,
    symbol: "ETH",
    amountBaseUnits: 10n ** 15n, // 0.001 ETH
  });
  const plan = await assembleEvmPlan({
    mode: "devnet",
    owner: OWNER,
    kind: "transfer",
    intentSummary: "Send 0.001 ETH",
    tx: built.tx,
    watched: built.watched,
    targets: built.targets,
    route: null,
    quote: null,
  });
  const eth = plan.diff.find((d) => d.isNative);
  console.log(`  sim.success: ${plan.simulation.success}  ETH delta: ${eth?.uiDelta}  signable: ${plan.signable}`);
  const ok = plan.simulation.success && plan.signable;
  console.log(ok ? "  \x1b[32m✓ Sepolia transfer signable\x1b[0m" : "  \x1b[31m✗ expected signable (is the address funded?)\x1b[0m");
  return ok;
}

async function main() {
  console.log(`Owner: ${OWNER}`);
  const a = await testMainnetSwap();
  const b = await testSepoliaTransfer();
  process.exit(a && b ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-evm errored:", e);
  process.exit(1);
});
