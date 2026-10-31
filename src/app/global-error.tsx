"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself. It REPLACES
 * the layout (including <html>/<body>), so it can't use the app's CSS — styles
 * are inlined. Theme-neutral on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          background: "#fafafa",
          color: "#18181b",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }} aria-hidden="true">⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#71717a", fontSize: 14, marginTop: 10 }}>
            A critical error occurred. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              borderRadius: 12,
              background: "#000",
              color: "#fff",
              border: "none",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error?.digest && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#a1a1aa" }}>Ref: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
