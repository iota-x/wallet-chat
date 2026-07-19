import type { PolicyOverride } from "./guardrails/policy";

/**
 * User-tunable guardrail settings, in localStorage. Only the "soft" controls are
 * exposed — the structural guarantees (sim-must-pass, program allowlist, raw
 * native cap) are not editable, and the pre-submit re-simulation always enforces
 * the built-in defaults as a floor. Tightening here blocks earlier.
 */

export interface PolicySettings {
  maxNotionalUsd: number;
  maxSlippageBps: number;
  largeValueUsd: number;
  quoteMaxAgeMs: number;
  /** Rolling 24h outflow ceiling (client-side velocity limit). */
  dailyCapUsd: number;
}

export const POLICY_DEFAULTS: PolicySettings = {
  maxNotionalUsd: 5000,
  maxSlippageBps: 100,
  largeValueUsd: 250,
  quoteMaxAgeMs: 30_000,
  dailyCapUsd: 10_000,
};

const KEY = "wc-policy-v1";
export const POLICY_EVENT = "wc-policy";

export function getPolicySettings(): PolicySettings {
  if (typeof window === "undefined") return { ...POLICY_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<PolicySettings>) : {};
    return { ...POLICY_DEFAULTS, ...stored };
  } catch {
    return { ...POLICY_DEFAULTS };
  }
}

/** The override forwarded to the agent (identical shape; server sanitizes). */
export function getPolicyOverride(): PolicyOverride {
  return getPolicySettings();
}

export function setPolicySettings(s: PolicySettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(POLICY_EVENT));
  } catch {
    /* ignore */
  }
}

export function resetPolicy() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(POLICY_EVENT));
}

/**
 * Mainnet signing switch. OFF by default: mainnet is read-only (real reads,
 * plans and sims, but no broadcast) until the user explicitly turns this on,
 * accepting that confirmed plans will then move real funds.
 */
const SIGN_KEY = "wc-mainnet-signing-v1";

export function getMainnetSigning(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIGN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMainnetSigning(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIGN_KEY, on ? "1" : "0");
    window.dispatchEvent(new Event(POLICY_EVENT));
  } catch {
    /* ignore */
  }
}
