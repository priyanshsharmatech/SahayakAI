import Link from "next/link";

/** 404 page shown for unknown routes. Inherits the app theme from the layout. */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-md text-center">
        <div className="text-6xl font-extrabold tracking-tighter text-zinc-200 dark:text-zinc-800 select-none">
          404
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-bold hover:opacity-90 transition"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
