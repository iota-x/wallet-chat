import { describe, it, expect } from "vitest";
import { decodeApproval } from "@/lib/evm/approvals";
import { screenRecipient } from "@/lib/security/recipient";
import { rollingOutflowUsd, planOutflowUsd } from "@/lib/security/velocity";
import { screenBlocklist, blocklistCheck } from "@/lib/security/blocklist";
import { evaluateGuardrails, type PolicyInput } from "@/lib/guardrails/policy";

// A real OFAC-sanctioned address bundled in the blocklist.
const SANCTIONED = "0x722122df12d4e14e13ac3b6895a86e84145b6967";

// ── approval decoding ────────────────────────────────────────────────────────

const ROUTER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5";
const MAX_UINT = "f".repeat(64);

/** approve(spender, amount) calldata. */
function approveCalldata(spender: string, amountHex: string): string {
  const spenderWord = spender.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  return "0x095ea7b3" + spenderWord + amountHex.padStart(64, "0");
}

describe("decodeApproval", () => {
  it("returns null for non-approval calldata (a plain swap call)", () => {
    expect(decodeApproval("0xabcdef12" + "00".repeat(32))).toBeNull();
    expect(decodeApproval("0x")).toBeNull();
    expect(decodeApproval(null)).toBeNull();
  });

  it("decodes an unlimited erc20 approve", () => {
    const a = decodeApproval(approveCalldata(ROUTER, MAX_UINT));
    expect(a).not.toBeNull();
    expect(a!.kind).toBe("erc20-approve");
    expect(a!.spender).toBe(ROUTER);
    expect(a!.unlimited).toBe(true);
    expect(a!.approved).toBe(true);
  });

  it("decodes a bounded approve as not-unlimited", () => {
    const a = decodeApproval(approveCalldata(ROUTER, "0de0b6b3a7640000")); // 1e18
    expect(a!.unlimited).toBe(false);
    expect(a!.amount).toBe((10n ** 18n).toString());
  });

  it("treats approve(spender, 0) as a revoke", () => {
    const a = decodeApproval(approveCalldata(ROUTER, "0"));
    expect(a!.approved).toBe(false);
  });

  it("decodes setApprovalForAll(operator, true) as unlimited", () => {
    const op = ROUTER.replace(/^0x/, "").padStart(64, "0");
    const a = decodeApproval("0xa22cb465" + op + "1".padStart(64, "0"));
    expect(a!.kind).toBe("setApprovalForAll");
    expect(a!.unlimited).toBe(true);
    expect(a!.approved).toBe(true);
  });
});

describe("guardrail: approval-safety", () => {
  function input(over: Partial<PolicyInput>): PolicyInput {
    return {
      mode: "mainnet",
      simulationPassed: true,
      programIds: [],
      diff: [],
      swap: null,
      quote: null,
      now: Date.now(),
      config: { allowedPrograms: [ROUTER] },
      ...over,
    };
  }

  it("blocks an approval to a non-allowlisted spender", () => {
    const r = evaluateGuardrails(
      input({ approval: { kind: "erc20-approve", spender: "0xdead", amount: "1", unlimited: false, approved: true } })
    );
    expect(r.pass).toBe(false);
    expect(r.blocking.join(" ")).toMatch(/non-allowlisted spender/);
  });

  it("warns (does not block) on an unlimited approval to an allowlisted spender", () => {
    const r = evaluateGuardrails(
      input({ approval: { kind: "erc20-approve", spender: ROUTER, amount: MAX_UINT, unlimited: true, approved: true } })
    );
    expect(r.pass).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/unlimited approval/);
  });

  it("passes a bounded approval to an allowlisted spender", () => {
    const r = evaluateGuardrails(
      input({ approval: { kind: "erc20-approve", spender: ROUTER, amount: "1000", unlimited: false, approved: true } })
    );
    expect(r.pass).toBe(true);
  });
});

// ── blocklist ────────────────────────────────────────────────────────────────

describe("blocklist", () => {
  it("flags a sanctioned address case-insensitively", () => {
    expect(screenBlocklist(SANCTIONED.toUpperCase())?.category).toBe("sanctioned");
    expect(screenBlocklist("  " + SANCTIONED + "  ")).not.toBeNull();
  });

  it("passes a clean address", () => {
    expect(screenBlocklist("0x1111111111111111111111111111111111111111")).toBeNull();
  });

  it("blocklistCheck returns null when there is nothing to screen", () => {
    expect(blocklistCheck([null, undefined])).toBeNull();
  });

  it("blocklistCheck blocks on a hit and passes when clean", () => {
    expect(blocklistCheck([SANCTIONED])?.passed).toBe(false);
    expect(blocklistCheck(["0x1111111111111111111111111111111111111111"])?.passed).toBe(true);
  });

  it("guardrail blocks a transfer to a sanctioned recipient", () => {
    const r = evaluateGuardrails({
      mode: "mainnet",
      simulationPassed: true,
      programIds: [],
      diff: [],
      swap: null,
      quote: null,
      now: Date.now(),
      recipient: SANCTIONED,
      config: { allowedPrograms: [] },
    });
    expect(r.pass).toBe(false);
    expect(r.blocking.join(" ")).toMatch(/flagged/);
  });
});

// ── recipient screening ──────────────────────────────────────────────────────

describe("screenRecipient", () => {
  const mom = { label: "mom", address: "0x1234abcd0000000000000000000000000000cdef" };
  const known = [mom];

  it("recognizes an exact known address (case-insensitive)", () => {
    const v = screenRecipient(mom.address.toUpperCase(), known);
    expect(v.level).toBe("known");
    if (v.level === "known") expect(v.label).toBe("mom");
  });

  it("flags a never-seen address as new", () => {
    const v = screenRecipient("0x9999888877776666555544443333222211110000", known);
    expect(v.level).toBe("new");
  });

  it("detects a poisoned lookalike sharing prefix + suffix", () => {
    // same first 4 (1234) and last 4 (cdef) as mom, different middle.
    const v = screenRecipient("0x1234ffffffffffffffffffffffffffffffffcdef", known);
    expect(v.level).toBe("poisoning");
    if (v.level === "poisoning") expect(v.lookalike).toBe(mom.address);
  });

  it("does not flag an address that only shares the prefix", () => {
    const v = screenRecipient("0x1234ffffffffffffffffffffffffffffffff0000", known);
    expect(v.level).toBe("new");
  });
});

// ── velocity ─────────────────────────────────────────────────────────────────

describe("velocity", () => {
  const now = 1_000_000_000_000;
  const hour = 3_600_000;

  it("sums outflow within the 24h window and ignores older/failed", () => {
    const txs = [
      { ts: now - hour, outflowUsd: 100 },
      { ts: now - 2 * hour, outflowUsd: 250, status: "confirmed" },
      { ts: now - 25 * hour, outflowUsd: 999 }, // outside window
      { ts: now - hour, outflowUsd: 500, status: "failed" }, // failed
      { ts: now - hour }, // no outflowUsd → 0
    ];
    expect(rollingOutflowUsd(txs, now)).toBe(350);
  });

  it("planOutflowUsd nets priced credits against debits, floored at 0", () => {
    // A transfer: debit only → full outflow.
    expect(planOutflowUsd([{ delta: "-250000000", usd: -250 }])).toBe(250);
    // A swap: debit ~= credit → near zero net outflow.
    expect(
      planOutflowUsd([
        { delta: "-1000000000", usd: -1000 }, // token in
        { delta: "999000000", usd: 990 }, // token out
      ])
    ).toBe(10);
    // Swap into a worthless (unpriced) token still counts as real outflow.
    expect(
      planOutflowUsd([
        { delta: "-1000000000", usd: -1000 },
        { delta: "500", usd: null },
      ])
    ).toBe(1000);
  });
});
