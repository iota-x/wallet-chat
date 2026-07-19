"use client";

import React, { useState } from "react";
import {
  getPolicySettings,
  setPolicySettings,
  resetPolicy,
  getMainnetSigning,
  setMainnetSigning,
  POLICY_DEFAULTS,
  type PolicySettings,
} from "@/lib/policy-store";

interface Field {
  key: keyof PolicySettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  /** display transform (store → shown) */
  toShown: (v: number) => number;
  fromShown: (v: number) => number;
  unit: string;
}

const FIELDS: Field[] = [
  {
    key: "maxNotionalUsd",
    label: "Max spend per transaction",
    hint: "Blocks any plan whose net USD outflow exceeds this.",
    min: 10,
    max: 100000,
    step: 10,
    toShown: (v) => v,
    fromShown: (v) => v,
    unit: "$",
  },
  {
    key: "dailyCapUsd",
    label: "Daily spend ceiling",
    hint: "Rolling 24h outflow limit across all your transactions.",
    min: 100,
    max: 200000,
    step: 100,
    toShown: (v) => v,
    fromShown: (v) => v,
    unit: "$",
  },
  {
    key: "maxSlippageBps",
    label: "Slippage ceiling",
    hint: "Max tolerated slippage on a swap.",
    min: 5,
    max: 1000,
    step: 5,
    toShown: (v) => v / 100,
    fromShown: (v) => Math.round(v * 100),
    unit: "%",
  },
  {
    key: "largeValueUsd",
    label: "Typed-confirmation above",
    hint: "Outflows at/above this require typing a phrase to arm.",
    min: 0,
    max: 50000,
    step: 10,
    toShown: (v) => v,
    fromShown: (v) => v,
    unit: "$",
  },
  {
    key: "quoteMaxAgeMs",
    label: "Quote freshness window",
    hint: "A quote older than this blocks signing until re-simulated.",
    min: 5,
    max: 120,
    step: 1,
    toShown: (v) => Math.round(v / 1000),
    fromShown: (v) => v * 1000,
    unit: "s",
  },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<PolicySettings>(() => getPolicySettings());
  const [signing, setSigning] = useState<boolean>(() => getMainnetSigning());

  function update(key: keyof PolicySettings, shown: number, f: Field) {
    const next = { ...settings, [key]: f.fromShown(shown) };
    setSettings(next);
    setPolicySettings(next);
  }
  function reset() {
    resetPolicy();
    setSettings({ ...POLICY_DEFAULTS });
  }

  const isDefault =
    JSON.stringify(settings) === JSON.stringify(POLICY_DEFAULTS);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-line bg-paper2 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/70">
          <div>
            <span className="eyebrow">guardrail settings</span>
            <div className="text-[13px] text-ink font-medium mt-0.5">your safety limits</div>
          </div>
          <div className="flex items-center gap-2">
            {!isDefault && (
              <button
                onClick={reset}
                className="font-mono text-[11px] text-ink3 hover:text-ink transition-colors"
              >
                reset
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-7 w-7 grid place-items-center rounded-lg border border-line text-ink2 hover:border-magenta"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          {/* The one switch that turns a simulation into a real transaction. */}
          <div
            className={`rounded-xl border px-3 py-3 ${
              signing ? "border-neg/50 bg-neg/[0.06]" : "border-line/70 bg-haze/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] text-ink font-medium">
                  Enable mainnet signing
                </div>
                <p className="text-[11px] text-ink3 mt-0.5">
                  Off: mainnet is read-only (plan + simulate only). On: confirmed
                  plans broadcast <span className="text-neg">real transactions</span>.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={signing}
                onClick={() => {
                  const v = !signing;
                  setSigning(v);
                  setMainnetSigning(v);
                }}
                className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  signing ? "bg-neg" : "bg-line"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    signing ? "translate-x-[22px]" : "translate-x-[2px]"
                  }`}
                />
              </button>
            </div>
            {signing && (
              <p className="text-[11px] text-neg mt-2 leading-relaxed">
                ⚠ You are signing with real funds on mainnet. The guardrails below
                and the pre-submit re-simulation are the only safety net.
              </p>
            )}
          </div>

          {FIELDS.map((f) => {
            const shown = f.toShown(settings[f.key]);
            return (
              <div key={f.key}>
                <div className="flex items-baseline justify-between">
                  <label className="text-[13px] text-ink font-medium">{f.label}</label>
                  <span className="num text-[13px] text-magenta">
                    {f.unit === "$" ? "$" : ""}
                    {shown.toLocaleString()}
                    {f.unit !== "$" ? f.unit : ""}
                  </span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={shown}
                  onChange={(e) => update(f.key, Number(e.target.value), f)}
                  className="w-full mt-2 accent-magenta"
                />
                <p className="text-[11px] text-ink3 mt-1">{f.hint}</p>
              </div>
            );
          })}

          <div className="rounded-xl border border-line/70 bg-haze/40 px-3 py-2.5">
            <div className="eyebrow">not editable</div>
            <p className="text-[11px] text-ink2 mt-1 leading-relaxed">
              Simulation-must-pass, the program allowlist, and the raw native-asset
              cap are fixed safety guarantees. The pre-submit re-simulation always
              re-checks the built-in defaults, so these settings can tighten limits
              but never weaken the floor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
