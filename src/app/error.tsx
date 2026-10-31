"use client";
import { useEffect } from "react";

/**
 * Route-level error boundary. Catches render/runtime errors in a segment and
 * shows a recoverable fallback instead of a blank screen. Renders inside the
 * root layout, so it inherits the app theme.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for local debugging / browser console capture.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          An unexpected error occurred. You can try again, or head back home.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-bold hover:opacity-90 transition cursor-pointer"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Go home
          </a>
        </div>
        {error?.digest && (
          <p className="mt-4 text-[11px] text-zinc-400 dark:text-zinc-600">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
