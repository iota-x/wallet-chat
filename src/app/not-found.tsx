import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh grid place-items-center px-6 text-center">
      <div className="max-w-md space-y-4">
        <span className="eyebrow">error · 404 · no route</span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink text-balance">
          This page didn’t simulate.
        </h1>
        <p className="text-ink2 text-sm leading-relaxed">
          The address you’re looking for isn’t on this chain. Head back and state an
          intent instead.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <Link
            href="/"
            className="rounded-lg bg-magenta text-paper px-4 py-2 font-mono text-[12px] hover:bg-ink transition-colors"
          >
            ← home
          </Link>
          <Link
            href="/app"
            className="rounded-lg border border-line px-4 py-2 font-mono text-[12px] text-ink2 hover:border-magenta hover:text-ink transition-colors"
          >
            open the app
          </Link>
        </div>
      </div>
    </main>
  );
}
