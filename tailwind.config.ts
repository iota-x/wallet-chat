import type { Config } from "tailwindcss";

// ── "The transaction, made transparent." ─────────────────────────────────────
// Editorial, gallery-light. One iridescent glass artifact, huge tight grotesque
// type, and magenta annotation callouts that inspect it — the visual language of
// a transaction verifier. Paper is a cool neutral white (not warm cream), the
// accent is magenta (not clay), the iridescence is lilac→periwinkle→amber.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Theme-swappable via CSS vars (see globals: :root light, [data-theme=dark]).
      // The glass gradient colors (lilac/peri/amber/magenta-soft) stay constant
      // across themes so the iridescent identity holds in both.
      colors: {
        paper: "rgb(var(--c-paper) / <alpha-value>)",
        paper2: "rgb(var(--c-paper2) / <alpha-value>)",
        haze: "rgb(var(--c-haze) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        ink2: "rgb(var(--c-ink2) / <alpha-value>)",
        ink3: "rgb(var(--c-ink3) / <alpha-value>)",
        magenta: "rgb(var(--c-magenta) / <alpha-value>)",
        pos: "rgb(var(--c-pos) / <alpha-value>)",
        neg: "rgb(var(--c-neg) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        "magenta-soft": "#F0A9DE",
        lilac: "#B4A4E4",
        peri: "#8E97E8",
        amber: "#E6A15C",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tight2: "-0.03em",
        label: "0.16em",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "draw-line": {
          "0%": { strokeDashoffset: "220" },
          "100%": { strokeDashoffset: "0" },
        },
        "glass-float": {
          "0%,100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-14px) rotate(0.6deg)" },
        },
        "hue-drift": {
          "0%": { filter: "hue-rotate(0deg)" },
          "100%": { filter: "hue-rotate(24deg)" },
        },
        "count-in": {
          "0%": { opacity: "0", transform: "translateY(0.3em)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "print-in": {
          "0%": { opacity: "0", clipPath: "inset(0 0 100% 0)" },
          "100%": { opacity: "1", clipPath: "inset(0 0 0% 0)" },
        },
        "stamp-in": {
          "0%": { opacity: "0", transform: "scale(1.5) rotate(-9deg)" },
          "60%": { opacity: "1" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-5deg)" },
        },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.25" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "rise-in": "rise-in 0.7s cubic-bezier(0.16,1,0.3,1) both",
        "draw-line": "draw-line 0.9s ease-out 0.4s both",
        "glass-float": "glass-float 9s ease-in-out infinite",
        "hue-drift": "hue-drift 14s ease-in-out infinite alternate",
        "count-in": "count-in 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up": "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "print-in": "print-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "stamp-in": "stamp-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        blink: "blink 1.1s step-end infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
