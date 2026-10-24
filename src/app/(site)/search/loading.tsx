/** Placeholder while a page's data loads (mostly search and filtered lists). */
export default function Loading() {
  return (
    <div className="container" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="page-head">
        <div className="skeleton" style={{ height: 14, width: 180 }} />
        <div className="skeleton" style={{ height: 56, width: "min(560px, 90%)", marginTop: 24 }} />
        <div className="skeleton" style={{ height: 18, width: "min(420px, 80%)", marginTop: 18 }} />
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 88 }} />
        ))}
      </div>
    </div>
  );
}
