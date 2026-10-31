"use client";
import React from "react";

/**
 * Shimmering placeholder block used while data loads. Matches the dashboard's
 * light/dark surfaces. Purely decorative — marked aria-hidden so screen readers
 * skip it (wrap the loading region in aria-busy instead).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800/70 ${className}`}
    />
  );
}

/** A few stacked lines of fake text. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** A card-shaped skeleton that mirrors the dashboard StatCard look. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-5 shadow-sm ${className}`}
    >
      <Skeleton className="h-3.5 w-20 mb-3" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}

/** A skeleton row for list-style panels (inbox, sources, members, etc.). */
export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 ${className}`}
    >
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-2.5 w-2/3" />
      </div>
    </div>
  );
}

/** Convenience: a vertical stack of skeleton rows. */
export function SkeletonList({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
