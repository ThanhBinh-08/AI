/** Shown while the catalog loads (first visit after a cache refresh). */
export default function Loading() {
  return (
    <div className="container mk mk-loading" aria-busy="true">
      <p className="sr-only" role="status">
        Loading deals
      </p>
      <div className="mk-hero">
        <div className="skeleton" style={{ height: 14, width: 120 }} />
        <div className="skeleton" style={{ height: 56, maxWidth: 560, marginTop: 20 }} />
      </div>
      <ul className="fd-grid" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="skeleton fd-skeleton" />
        ))}
      </ul>
      <div className="skeleton search" />
    </div>
  );
}
