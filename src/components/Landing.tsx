import React from "react";
import Link from "next/link";
import { InteractiveGlass } from "./InteractiveGlass";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Landing — "The transaction, made transparent." Editorial and gallery-light:
 * one iridescent glass artifact, huge tight grotesque type, and magenta
 * annotation callouts that inspect it (the visual grammar of a verifier).
 */
export function Landing() {
  return (
    <div className="min-h-dvh">
      <Nav />
      <Hero />
      <Guarantees />
      <SlipShot />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <GlassMark />
          <span className="font-mono text-[13px] font-medium tracking-tight text-ink">
            walletchat
          </span>
        </div>
        <nav className="flex items-center gap-3 sm:gap-4">
          <span className="hidden sm:inline eyebrow">sol · eth · btc</span>
          <ThemeToggle />
          <Link
            href="/app"
            className="font-mono text-[12px] rounded-full bg-ink text-paper px-4 py-2 hover:bg-magenta transition-colors"
          >
            launch app →
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="grain relative overflow-hidden">
      {/* Atmosphere — soft lavender bloom + warm accent behind the artwork,
          and a gentle vignette. Depth, not glow. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute right-[2%] top-[8%] h-[64vh] w-[64vh] rounded-full blur-[120px] animate-bloom-pulse"
          style={{
            background:
              "radial-gradient(circle, rgba(180,164,228,0.4) 0%, rgba(142,151,232,0.16) 45%, transparent 70%)",
          }}
        />
        <div
          className="absolute right-[14%] top-[34%] h-[36vh] w-[36vh] rounded-full blur-[110px] opacity-70 animate-bloom-pulse"
          style={{
            animationDelay: "2.4s",
            background: "radial-gradient(circle, rgba(230,161,92,0.22) 0%, transparent 66%)",
          }}
        />
        <div className="absolute inset-0 vignette" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8 pt-8 sm:pt-16 pb-24">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-8 items-center">
          {/* Left — the thesis, revealed as a staggered load sequence */}
          <div className="relative z-10">
            <div className="eyebrow animate-rise-in" style={{ animationDelay: "0.05s" }}>
              agentic wallet · transaction verifier
            </div>
            <h1 className="mt-6 font-sans font-black tracking-tight2 leading-[0.95] text-ink text-[clamp(2.7rem,8vw,5.3rem)]">
              <span className="block animate-rise-in" style={{ animationDelay: "0.14s" }}>
                Every
              </span>
              <span className="block animate-rise-in" style={{ animationDelay: "0.22s" }}>
                transaction,
              </span>
              <span
                className="block glass-text animate-rise-in"
                style={{ animationDelay: "0.3s" }}
              >
                made&nbsp;transparent.
              </span>
            </h1>
            <p
              className="mt-7 max-w-md text-[15px] leading-relaxed text-ink2 animate-rise-in"
              style={{ animationDelay: "0.44s" }}
            >
              State an intent in plain English. WalletChat plans it, simulates it
              against live chain state, and shows the exact balance diff — nothing
              signs until the guardrails pass and you arm it.
            </p>
            <div
              className="mt-10 flex flex-wrap items-center gap-4 animate-rise-in"
              style={{ animationDelay: "0.56s" }}
            >
              <Link
                href="/app"
                className="font-mono text-[13px] rounded-full bg-magenta text-paper px-6 py-3 shadow-[0_14px_44px_-12px_rgba(213,30,166,0.55)] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-12px_rgba(213,30,166,0.72)] transition-all duration-200"
              >
                launch app →
              </Link>
              <a
                href="#how"
                className="font-mono text-[13px] rounded-full border border-line px-6 py-3 text-ink2 hover:border-ink hover:text-ink transition-colors"
              >
                how it works
              </a>
            </div>
          </div>

          {/* Right — the glass artifact (breathes, leans to your pointer), annotated */}
          <div className="relative animate-rise-in" style={{ animationDelay: "0.2s" }}>
            <ReflectedLight />
            <InteractiveGlass />
            <AnnotationLayer />
          </div>
        </div>
      </div>
    </section>
  );
}

/** A soft pool of reflected light beneath the crystal, grounding it on the page. */
function ReflectedLight() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 bottom-[4%] -translate-x-1/2 h-[14%] w-[58%] rounded-[50%] blur-2xl opacity-60 animate-bloom-pulse"
      style={{
        background: "radial-gradient(ellipse, rgba(180,164,228,0.5) 0%, transparent 70%)",
      }}
    />
  );
}

/** The signature transfer from the reference: magenta-tagged crops with a thin
 * connector line pointing into the glass, labelling what the verifier inspects. */
function AnnotationLayer() {
  return (
    <>
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 400 400"
        preserveAspectRatio="none"
        aria-hidden
      >
        <line
          x1="70" y1="70" x2="205" y2="180"
          stroke="#D51EA6" strokeWidth="1" strokeDasharray="220"
          className="animate-draw-line"
        />
        <line
          x1="330" y1="322" x2="215" y2="215"
          stroke="#D51EA6" strokeWidth="1" strokeDasharray="220"
          className="animate-draw-line"
        />
      </svg>

      <Callout className="left-[2%] top-[8%]" label="simulated">
        exact balance diff
      </Callout>
      <Callout className="right-[0%] bottom-[14%]" label="guardrails" tone="pos">
        pass
      </Callout>
    </>
  );
}

function Callout({
  className = "",
  label,
  children,
  tone = "magenta",
}: {
  className?: string;
  label: string;
  children: React.ReactNode;
  tone?: "magenta" | "pos";
}) {
  return (
    <div
      className={`absolute ${className} rounded-md border bg-paper2/80 backdrop-blur px-2.5 py-1.5 shadow-sm ${
        tone === "pos" ? "border-pos/50" : "border-magenta/60"
      }`}
      style={{ animation: "fade-up 0.5s 0.7s both" }}
    >
      <div className={`font-mono text-[9px] uppercase tracking-label ${tone === "pos" ? "text-pos" : "text-magenta"}`}>
        {label}
      </div>
      <div className="font-mono text-[12px] text-ink mt-0.5">{children}</div>
    </div>
  );
}

function Guarantees() {
  const items = [
    {
      k: "simulate before sign",
      v: "Nothing is signable unless it simulates successfully against live chain state. There is no bypass path.",
    },
    {
      k: "the exact diff",
      v: "Balances are decoded from real post-simulation state — token layout, decimals, fees, rent — down to the last unit.",
    },
    {
      k: "guardrails gate signing",
      v: "Spend caps, a program allowlist, slippage ceilings and staleness checks must all pass before the confirm control arms.",
    },
  ];
  return (
    <section id="how" className="border-t border-line/70">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16">
        <div className="eyebrow">what makes it safe</div>
        <div className="mt-8 grid md:grid-cols-3 gap-x-8 gap-y-10">
          {items.map((it) => (
            <div key={it.k} className="border-t border-ink pt-4">
              <h3 className="font-sans font-bold text-[19px] tracking-tight text-ink leading-snug">
                {it.k}
              </h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink2">{it.v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A real verification slip, rendered as light paper — the product's artifact. */
function SlipShot() {
  return (
    <section className="border-t border-line/70">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="eyebrow">the output</div>
          <h2 className="mt-4 font-sans font-extrabold tracking-tight2 text-ink text-[clamp(2rem,4.5vw,3rem)] leading-[1.02]">
            A slip you can
            <br />
            actually read.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink2">
            Every plan prints as a verification slip: the route, the signed
            deltas, fees, and an inspection stamp. It reads like a receipt for
            something that hasn&apos;t happened yet — so you decide before it does.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {["solana", "ethereum", "bitcoin"].map((c) => (
              <span
                key={c}
                className="font-mono text-[11px] rounded-full border border-line px-3 py-1.5 text-ink2"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="perforation" />
          <div className="ledger-rule slip-paper rounded-b-2xl px-5 pt-4 pb-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="eyebrow">verification slip · swap</span>
              <span className="num text-[10px] text-ink3">eplan · 04</span>
            </div>
            <div className="mt-4 space-y-2">
              <SlipRow s="USDC" tag="debit" v="−250.00" tone="neg" />
              <SlipRow s="JitoSOL" tag="credit" v="+1.6820" tone="pos" />
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="eyebrow">network fee</span>
              <span className="num text-[12px] text-ink2">0.000015 SOL</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="eyebrow">guardrails</span>
              <span className="font-mono text-[13px] tracking-label text-pos border-2 border-pos/50 rounded px-2 -rotate-3">
                PASS
              </span>
            </div>
          </div>
          <div
            className="absolute -left-4 -bottom-4 rounded-md border border-magenta/60 bg-paper2/85 backdrop-blur px-2.5 py-1.5 shadow-sm"
            style={{ animation: "fade-up 0.5s both" }}
          >
            <div className="font-mono text-[9px] uppercase tracking-label text-magenta">re-checked</div>
            <div className="font-mono text-[11px] text-ink mt-0.5">before you sign</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SlipRow({
  s,
  tag,
  v,
  tone,
}: {
  s: string;
  tag: string;
  v: string;
  tone: "pos" | "neg";
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[13px] text-ink">{s}</span>
      <span className="font-mono text-[9px] uppercase tracking-label text-ink3">{tag}</span>
      <span className="flex-1 self-center border-b border-dotted border-line" />
      <span className={`num text-[14px] ${tone === "pos" ? "text-pos" : "text-neg"}`}>{v}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <GlassMark />
          <span className="font-mono text-[12px] text-ink2">
            walletchat — simulate · guardrail · sign
          </span>
        </div>
        <Link
          href="/app"
          className="font-mono text-[12px] rounded-full bg-ink text-paper px-4 py-2 hover:bg-magenta transition-colors"
        >
          launch app →
        </Link>
      </div>
    </footer>
  );
}

function GlassMark() {
  return (
    <span
      className="h-6 w-6 rounded-[7px] shrink-0"
      style={{
        background:
          "conic-gradient(from 210deg, #C7B8F0, #8E97E8, #EBB2E4, #E6A15C, #C7B8F0)",
        boxShadow: "inset 0 0 6px rgba(255,255,255,0.6)",
      }}
      aria-hidden
    />
  );
}
