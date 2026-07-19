import { describe, it, expect } from "vitest";
import {
  evaluateGuardrails,
  sanitizePolicyOverride,
  DEFAULT_POLICY,
  DEFAULT_ALLOWED_PROGRAMS,
  type PolicyInput,
} from "@/lib/guardrails/policy";

const SYSTEM = "11111111111111111111111111111111";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const DRAINER = "Dra1nerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

/** A baseline plan that passes everything: a small priced USDC send. */
function basePlan(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    mode: "devnet",
    simulationPassed: true,
    programIds: [SYSTEM, TOKEN],
    diff: [
      { symbol: "USDC", decimals: 6, delta: "-10000000", usd: -10, isNative: false },
    ],
    swap: null,
    quote: null,
    now: 1_000_000,
    ...overrides,
  };
}

describe("guardrails: foundational invariants", () => {
  it("passes a clean small transfer", () => {
    const r = evaluateGuardrails(basePlan());
    expect(r.pass).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.typedConfirmation).toBeNull();
  });

  it("BLOCKS when simulation did not pass — no bypass", () => {
    const r = evaluateGuardrails(basePlan({ simulationPassed: false }));
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === "sim-must-pass")?.passed).toBe(false);
  });

  it("BLOCKS an unknown/unallowlisted program (drainer scenario)", () => {
    const r = evaluateGuardrails(
      basePlan({ programIds: [SYSTEM, TOKEN, DRAINER] })
    );
    expect(r.pass).toBe(false);
    const check = r.checks.find((c) => c.id === "program-allowlist");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain(DRAINER);
  });

  it("allows every default-allowlisted program", () => {
    const r = evaluateGuardrails(
      basePlan({ programIds: [...DEFAULT_ALLOWED_PROGRAMS] })
    );
    expect(r.checks.find((c) => c.id === "program-allowlist")?.passed).toBe(true);
  });
});

describe("guardrails: spend caps", () => {
  it("BLOCKS a USD outflow above the notional cap", () => {
    const r = evaluateGuardrails(
      basePlan({
        diff: [
          {
            symbol: "USDC",
            decimals: 6,
            delta: "-6000000000",
            usd: -6000,
            isNative: false,
          },
        ],
      })
    );
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === "spend-cap")?.passed).toBe(false);
  });

  it("BLOCKS a raw SOL outflow above the SOL cap EVEN IF unpriced (price-lie defense)", () => {
    // Attacker sets usd to null/0 to dodge the USD cap; the raw SOL cap holds.
    const r = evaluateGuardrails(
      basePlan({
        diff: [
          {
            symbol: "SOL",
            decimals: 9,
            delta: (-30n * 1_000_000_000n).toString(),
            usd: null,
            isNative: true,
          },
        ],
      })
    );
    expect(r.pass).toBe(false);
    const cap = r.checks.find((c) => c.id === "spend-cap");
    expect(cap?.passed).toBe(false);
    expect(cap?.detail).toContain("SOL");
  });

  it("does not count inflows against the cap", () => {
    const r = evaluateGuardrails(
      basePlan({
        diff: [
          { symbol: "SOL", decimals: 9, delta: "-1000000", usd: -0.2, isNative: true },
          { symbol: "USDC", decimals: 6, delta: "9999000000", usd: 9999, isNative: false },
        ],
      })
    );
    expect(r.checks.find((c) => c.id === "spend-cap")?.passed).toBe(true);
  });
});

describe("guardrails: swaps — slippage & price impact", () => {
  it("BLOCKS slippage above the ceiling", () => {
    const r = evaluateGuardrails(
      basePlan({
        programIds: [JUPITER, TOKEN, SYSTEM],
        swap: { slippageBps: 500, priceImpactPct: 0.2 },
      })
    );
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === "slippage-ceiling")?.passed).toBe(false);
  });

  it("BLOCKS ruinous price impact", () => {
    const r = evaluateGuardrails(
      basePlan({
        programIds: [JUPITER, TOKEN, SYSTEM],
        swap: { slippageBps: 50, priceImpactPct: 12 },
      })
    );
    expect(r.pass).toBe(false);
    const pi = r.checks.find((c) => c.id === "price-impact");
    expect(pi?.severity).toBe("block");
    expect(pi?.passed).toBe(false);
  });

  it("WARNS (does not block) on notable-but-tolerable price impact", () => {
    const r = evaluateGuardrails(
      basePlan({
        programIds: [JUPITER, TOKEN, SYSTEM],
        swap: { slippageBps: 50, priceImpactPct: 2 },
      })
    );
    expect(r.pass).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
    const pi = r.checks.find((c) => c.id === "price-impact");
    expect(pi?.severity).toBe("warn");
  });
});

describe("guardrails: quote staleness", () => {
  it("BLOCKS a stale quote", () => {
    const r = evaluateGuardrails(
      basePlan({
        quote: { fetchedAt: 1_000_000 - 60_000, ttlMs: 30_000 },
      })
    );
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === "quote-freshness")?.passed).toBe(false);
  });

  it("passes a fresh quote", () => {
    const r = evaluateGuardrails(
      basePlan({ quote: { fetchedAt: 1_000_000 - 5_000, ttlMs: 30_000 } })
    );
    expect(r.checks.find((c) => c.id === "quote-freshness")?.passed).toBe(true);
  });

  it("clamps an over-generous quote TTL to the policy ceiling", () => {
    // Quote claims a 10-minute TTL; policy ceiling is 30s, so 60s old is stale.
    const r = evaluateGuardrails(
      basePlan({
        quote: { fetchedAt: 1_000_000 - 60_000, ttlMs: 600_000 },
      })
    );
    expect(r.checks.find((c) => c.id === "quote-freshness")?.passed).toBe(false);
  });
});

describe("guardrails: typed confirmation for large value", () => {
  it("requires typed confirmation above the USD large-value threshold", () => {
    const r = evaluateGuardrails(
      basePlan({
        diff: [
          { symbol: "USDC", decimals: 6, delta: "-500000000", usd: -500, isNative: false },
        ],
      })
    );
    expect(r.pass).toBe(true);
    expect(r.typedConfirmation).toBe("send $500");
  });

  it("requires typed confirmation for large unpriced SOL outflow", () => {
    const r = evaluateGuardrails(
      basePlan({
        diff: [
          {
            symbol: "SOL",
            decimals: 9,
            delta: (-3n * 1_000_000_000n).toString(),
            usd: null,
            isNative: true,
          },
        ],
      })
    );
    expect(r.pass).toBe(true);
    expect(r.typedConfirmation).toBe("send 3 SOL");
  });

  it("never demands typed confirmation on a blocked plan", () => {
    const r = evaluateGuardrails(
      basePlan({ simulationPassed: false, diff: [
        { symbol: "USDC", decimals: 6, delta: "-500000000", usd: -500, isNative: false },
      ] })
    );
    expect(r.pass).toBe(false);
    expect(r.typedConfirmation).toBeNull();
  });
});

describe("guardrails: user policy override is sanitized", () => {
  it("clamps out-of-range and non-numeric values", () => {
    const o = sanitizePolicyOverride({
      maxNotionalUsd: -50,
      maxSlippageBps: 99999,
      largeValueUsd: "abc",
      quoteMaxAgeMs: 1, // below 3000 floor
    });
    expect(o.maxNotionalUsd).toBe(1); // clamped to min 1
    expect(o.maxSlippageBps).toBe(5000); // clamped to max
    expect(o.largeValueUsd).toBeUndefined(); // non-numeric dropped
    expect(o.quoteMaxAgeMs).toBe(3000); // clamped to min
  });

  it("passes through valid values and ignores junk", () => {
    const o = sanitizePolicyOverride({ maxNotionalUsd: 1000, nefarious: true });
    expect(o).toEqual({ maxNotionalUsd: 1000 });
  });

  it("a tighter override blocks a plan the default would allow", () => {
    const input: PolicyInput = {
      mode: "devnet",
      simulationPassed: true,
      programIds: [SYSTEM, TOKEN],
      diff: [{ symbol: "USDC", decimals: 6, delta: "-500000000", usd: -500, isNative: false }],
      swap: null,
      quote: null,
      now: 1_000_000,
      config: sanitizePolicyOverride({ maxNotionalUsd: 100 }),
    };
    const r = evaluateGuardrails(input);
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === "spend-cap")?.passed).toBe(false);
  });
});

describe("guardrails: policy is pure and side-effect free", () => {
  it("is deterministic for identical inputs", () => {
    const a = evaluateGuardrails(basePlan());
    const b = evaluateGuardrails(basePlan());
    expect(a).toEqual(b);
  });

  it("does not mutate its input diff", () => {
    const input = basePlan();
    const snapshot = JSON.stringify(input);
    evaluateGuardrails(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_POLICY.maxSlippageBps).toBeGreaterThan(0);
    expect(DEFAULT_POLICY.allowedPrograms).toContain(JUPITER);
  });
});
