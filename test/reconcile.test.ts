import { describe, it, expect } from "vitest";
import { compareDeltas } from "@/lib/reconcile";
import type { ReconcileDelta } from "@/lib/tx-store";

const usdc = (d: number): ReconcileDelta => ({ symbol: "USDC", mint: "usdc-mint", uiDelta: d, isNative: false });
const jito = (d: number): ReconcileDelta => ({ symbol: "JitoSOL", mint: "jito-mint", uiDelta: d, isNative: false });
const sol = (d: number): ReconcileDelta => ({ symbol: "SOL", mint: "SOL", uiDelta: d, isNative: true });

describe("compareDeltas", () => {
  it("matches when token legs land within tolerance (swap slippage absorbed)", () => {
    const r = compareDeltas([usdc(-250), jito(1.68), sol(-0.01)], [usdc(-250), jito(1.679), sol(-0.012)]);
    expect(r.status).toBe("matched");
  });

  it("flags drift when a token leg is outside the 1% band", () => {
    const r = compareDeltas([jito(1.68)], [jito(1.5)]);
    expect(r.status).toBe("drift");
    expect(r.lines.some((l) => l.startsWith("✕"))).toBe(true);
  });

  it("flags a predicted asset that didn't move at all", () => {
    const r = compareDeltas([usdc(-250)], []);
    expect(r.status).toBe("drift");
  });

  it("flags an unexpected asset that moved but wasn't predicted", () => {
    const r = compareDeltas([], [{ symbol: "BONK", mint: "bonk", uiDelta: 1000, isNative: false }]);
    expect(r.status).toBe("drift");
  });

  it("ignores native (fee/gas) variance for the verdict", () => {
    // Only native differs, and by a lot — still matched because native is informational.
    const r = compareDeltas([sol(-0.01)], [sol(-0.03)]);
    expect(r.status).toBe("matched");
    expect(r.nativeNote).toContain("SOL");
  });

  it("matches by mint, not symbol, and is case-insensitive on address", () => {
    const r = compareDeltas(
      [{ symbol: "WETH", mint: "0xAbC", uiDelta: 0.1, isNative: false }],
      [{ symbol: "WETH", mint: "0xabc", uiDelta: 0.1, isNative: false }]
    );
    expect(r.status).toBe("matched");
  });
});
