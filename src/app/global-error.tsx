"use client";

// The last line: the app's own layout failed. Plain HTML, the design's colours inline, no dependencies.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#050505", color: "#F4F1E8", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
          <h1 style={{ fontSize: 32, margin: "0 0 12px" }}>Aline didn&apos;t load.</h1>
          <p style={{ color: "#A9A59D", margin: "0 0 24px" }}>Your saved shots are safe on this device.</p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 999, border: 0, background: "#FF6A00", color: "#050505", fontWeight: 600, fontSize: 16 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
