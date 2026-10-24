import Link from "next/link";

/** Body of every 404 page: what happened, a search box and the main entry points. */
export function NotFoundContent() {
  return (
    <div className="container">
      <header className="page-head">
        <p className="display" style={{ fontSize: "clamp(64px, 12vw, 140px)", lineHeight: 1 }} aria-hidden="true">
          404
        </p>
        <h1 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginTop: 12 }}>
          This page does not exist
        </h1>
        <p className="lede" style={{ marginTop: 12 }}>
          The link may be old, or the deal or tool it pointed to was removed. Search, or start from one of these pages.
        </p>
        <form className="search-form" action="/search/" method="get" role="search" style={{ marginTop: 24 }}>
          <label htmlFor="nf-q" className="sr-only">
            Search the site
          </label>
          <input id="nf-q" className="input" type="search" name="q" maxLength={80} placeholder="Search tools, brands or deals" />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
          <Link className="btn btn-dark" href="/">
            Home
          </Link>
          <Link className="btn btn-dark" href="/deals/">
            All deals
          </Link>
          <Link className="btn btn-dark" href="/tools/">
            AI tools
          </Link>
        </div>
      </header>
    </div>
  );
}
