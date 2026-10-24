"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#17191C", color: "#E8EAED" }}>
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "96px 24px" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>The portal could not start</h1>
          <p style={{ color: "#A5ADB5", lineHeight: 1.6 }}>
            A client-side error prevented the application from loading. Reload the page to try
            again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #30353B",
              background: "#1D2024",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: 16, fontSize: 12, color: "#78828C" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
