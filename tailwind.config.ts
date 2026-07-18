import type { Config } from "tailwindcss";

// Design language: near-black canvas, one disciplined accent (a cold mint/cyan),
// mono for every number. Kept intentionally small — restraint is the aesthetic.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#08090c",
        surface: "#0e1015",
        raised: "#14171e",
        hairline: "#20242e",
        ink: "#e9edf4",
        muted: "#8a92a6",
        faint: "#5a6274",
        accent: "#4ff0c4", // the one accent
        "accent-dim": "#2bbf9a",
        pos: "#4ff0c4",
        neg: "#ff6b7a",
        warn: "#ffcf6b",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "count-in": {
          "0%": { opacity: "0", transform: "translateY(0.35em)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(79,240,196,0.35)" },
          "70%": { boxShadow: "0 0 0 8px rgba(79,240,196,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(79,240,196,0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "count-in": "count-in 0.5s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
