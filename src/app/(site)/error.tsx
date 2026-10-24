"use client";

import Link from "next/link";

/** Shown when a page cannot load its data (for example the Sheet is unreachable and nothing is cached). No details leak. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container" style={{ paddingTop: 48 }}>
      <div className="state" role="alert">
        <p className="display">This page could not load</p>
        <p>The deals data is temporarily unavailable. Try again in a moment; the rest of the site may still work.</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn btn-ghost" href="/blog/">
            Read the guides
          </Link>
        </div>
      </div>
    </div>
  );
}
