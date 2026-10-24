"use client";

/** Last-resort error screen (the root layout itself failed). Plain markup, no data, no details. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#000", color: "#fff", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: "#c4c2c3", marginBottom: 20 }}>The page could not be shown. Try again in a moment.</p>
          <button type="button" onClick={() => reset()} style={{ background: "#fff", color: "#000", border: 0, borderRadius: 999, padding: "12px 22px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
