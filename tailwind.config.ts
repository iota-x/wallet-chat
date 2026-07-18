import type { Config } from "tailwindcss";

// ── "The Verification Instrument" ────────────────────────────────────────────
// WalletChat as a precision ledger instrument that prints a verification slip
// for every intent. Deep cool ink, one disciplined signal-gold accent, and the
// semantically-required green/red for money in/out. The machine reports in mono
// on ruled paper; the human speaks in sans.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080A0F", // canvas — deep cool ink, not pure black
        surface: "#0E121A", // lifted surface
        panel: "#141A24", // controls / raised
        slip: "#10141C", // the verification-slip paper
        slipEdge: "#0B0E14", // perforation gutter behind the slip
        hairline: "#222A38",
        hairlineSoft: "#1A212C",
        "text-hi": "#E9EDF4", // primary text (cool white)
        "text-mid": "#8B94A6",
        "text-lo": "#565F71",
        gold: "#EEC069", // the one accent — brand + arm-to-sign
        "gold-deep": "#C79A45",
        "gold-dim": "#7A6533",
        pos: "#5CC08C", // received / credit
        neg: "#EC6A5E", // spent / debit
        warn: "#E0A94A", // guardrail warnings
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        label: "0.14em",
      },
      keyframes: {
        // The slip "prints" downward like paper feeding from a receipt printer.
        "print-in": {
          "0%": { opacity: "0", clipPath: "inset(0 0 100% 0)", transform: "translateY(-6px)" },
          "100%": { opacity: "1", clipPath: "inset(0 0 0% 0)", transform: "translateY(0)" },
        },
        // An inspection stamp pressing onto the slip, settling at a slight angle.
        "stamp-in": {
          "0%": { opacity: "0", transform: "scale(1.5) rotate(-9deg)" },
          "60%": { opacity: "1" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-5deg)" },
        },
        "count-in": {
          "0%": { opacity: "0", transform: "translateY(0.3em)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        // The arm-to-sign control energizing once when guardrails pass.
        "arm-glow": {
          "0%": { boxShadow: "0 0 0 0 rgba(238,192,105,0)" },
          "40%": { boxShadow: "0 0 22px 2px rgba(238,192,105,0.35)" },
          "100%": { boxShadow: "0 0 0 0 rgba(238,192,105,0)" },
        },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.25" } },
      },
      animation: {
        "print-in": "print-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "stamp-in": "stamp-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        "count-in": "count-in 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up": "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.6s infinite",
        "arm-glow": "arm-glow 1.8s ease-out",
        blink: "blink 1.1s step-end infinite",
      },
    },
  },
  plugins: [],
};

export default config;
