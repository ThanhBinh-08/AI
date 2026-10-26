import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { BrandTile, DealList, PostTile, ToolTile } from "@/components/cards/cards";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import { EmptyState, PageHead } from "@/components/ui/bits";
import { listFeaturedDeals, MAX_QUERY_LENGTH, search, type SearchResults } from "@/data/repository";
import { one, type SearchParams } from "@/lib/params";
import { withinLimit } from "@/lib/rate-limit";

// Results depend on the query: never cached, never indexed (robots.txt also asks crawlers to skip /search/).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  description: "Search AI tools, brands, categories, deals and guides.",
  alternates: { canonical: "/search/" },
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<SearchParams> };

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="result-group">
      <h2>
        {title} <span className="muted">({count})</span>
      </h2>
      {children}
    </section>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const raw = one(await searchParams, "q", 200);
  const tooLong = raw.length > MAX_QUERY_LENGTH;
  const q = raw.slice(0, MAX_QUERY_LENGTH);
  let results: SearchResults | null = null;
  let limited = false;
  if (q) {
    if (withinLimit(await headers(), "search")) results = await search(q);
    else limited = true;
  }
  // Featured deals in the categories the results belong to come first, minus deals already listed.
  const categories = results
    ? [...new Set([...results.tools.flatMap((t) => t.categories), ...results.brands.flatMap((b) => b.categories), ...results.categories.map((c) => c.slug), ...results.deals.flatMap((d) => d.brand.categories)])]
    : [];
  const featured = await listFeaturedDeals({ categories, exclude: results?.deals.map((d) => d.id) ?? [] });

  return (
    <div className="container">
      <PageHead crumbs={[{ name: "Home", path: "/" }, { name: "Search", path: "/search/" }]} title="Search">
        <form className="search-form" action="/search/" method="get" role="search" style={{ marginTop: 20 }}>
          <label htmlFor="s-q" className="sr-only">
            Search tools, brands, categories, deals and guides
          </label>
          <input
            id="s-q"
            className="input"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="e.g. video, transcription, coding assistant"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        {tooLong ? <p className="field-hint" style={{ marginTop: 8 }}>Searches are limited to {MAX_QUERY_LENGTH} characters; the rest was ignored.</p> : null}
      </PageHead>

      {limited ? (
        <EmptyState title="Too many searches" actions={<Link className="btn btn-ghost" href="/deals/">Browse deals instead</Link>}>
          You have searched many times in the last minute. Wait a minute and try again.
        </EmptyState>
      ) : !q ? (
        <p className="muted">Type a tool, brand, task or category. Results include deals, tools, brands and guides.</p>
      ) : results && results.total > 0 ? (
        <>
          <p className="result-count" role="status">
            {results.total} {results.total === 1 ? "result" : "results"} for &ldquo;{results.query}&rdquo;
          </p>
          <Group title="Deals" count={results.deals.length}>
            <DealList deals={results.deals} />
          </Group>
          <Group title="AI tools" count={results.tools.length}>
            <ul className="tiles">
              {results.tools.map((t) => (
                <ToolTile key={t.id} tool={t} />
              ))}
            </ul>
          </Group>
          <Group title="Brands" count={results.brands.length}>
            <ul className="tiles">
              {results.brands.map((b) => (
                <BrandTile key={b.id} brand={b} deals={results!.deals.filter((d) => d.brandId === b.id).length} tools={0} />
              ))}
            </ul>
          </Group>
          <Group title="Categories" count={results.categories.length}>
            <ul className="chips">
              {results.categories.map((c) => (
                <li key={c.slug}>
                  <Link className="chip" href={`/categories/${c.slug}/`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Group>
          <Group title="Guides" count={results.posts.length}>
            <ul className="tiles">
              {results.posts.map((p) => (
                <PostTile key={p.id} post={p} />
              ))}
            </ul>
          </Group>
        </>
      ) : (
        <EmptyState
          title="Nothing found"
          actions={
            <>
              <Link className="btn btn-primary" href="/deals/">
                Browse deals
              </Link>
              <Link className="btn btn-ghost" href="/categories/">
                Browse categories
              </Link>
            </>
          }
        >
          No tool, brand, deal or guide matches &ldquo;{q}&rdquo;. Try a shorter word or the task you want done.
        </EmptyState>
      )}
      <FeaturedDeals className="section" deals={featured} id="search-featured" />
    </div>
  );
}
