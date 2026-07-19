"use client";

import "./globals.css";

/** Catches errors thrown in the root layout itself — renders its own document. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <main className="min-h-dvh grid place-items-center px-6 text-center">
          <div className="max-w-md space-y-4">
            <span className="eyebrow">error · fatal</span>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">
              WalletChat failed to start.
            </h1>
            <p className="text-ink2 text-sm leading-relaxed">
              A fatal error occurred before the app could load. Reloading usually
              clears it.
            </p>
            <button
              onClick={reset}
              className="rounded-lg bg-magenta text-paper px-4 py-2 font-mono text-[12px] hover:bg-ink transition-colors"
            >
              reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
