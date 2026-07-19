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
}

export const POLICY_DEFAULTS: PolicySettings = {
  maxNotionalUsd: 5000,
  maxSlippageBps: 100,
  largeValueUsd: 250,
  quoteMaxAgeMs: 30_000,
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
