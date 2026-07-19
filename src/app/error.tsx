"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for local debugging; a production build would send to monitoring.
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-dvh grid place-items-center px-6 text-center">
      <div className="max-w-md space-y-4">
        <span className="eyebrow">error · unhandled</span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink text-balance">
          Something reverted.
        </h1>
        <p className="text-ink2 text-sm leading-relaxed">
          The app hit an error it couldn’t recover from. Your keys and funds are
          untouched — nothing signs without an explicit confirmation.
        </p>
        {error?.message && (
          <p className="num text-[11px] text-ink3 break-words rounded-lg border border-line bg-paper2 px-3 py-2">
            {error.message}
          </p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={reset}
            className="rounded-lg bg-magenta text-paper px-4 py-2 font-mono text-[12px] hover:bg-ink transition-colors"
          >
            try again
          </button>
          <Link
            href="/app"
            className="rounded-lg border border-line px-4 py-2 font-mono text-[12px] text-ink2 hover:border-magenta hover:text-ink transition-colors"
          >
            reload the app
          </Link>
        </div>
      </div>
    </main>
  );
}
