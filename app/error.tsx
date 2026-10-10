"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="text-steel">Please try again. If the problem continues, contact support.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
      >
        Try again
      </button>
    </main>
  );
}
