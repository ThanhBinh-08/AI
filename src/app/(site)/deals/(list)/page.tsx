import type { Metadata } from "next";
import Link from "next/link";
import { DealList, DealTicket } from "@/components/cards/cards";
import { AutoSubmit } from "@/components/ui/AutoSubmit";
import { ChipRail } from "@/components/ui/ChipRail";
import { EmptyState, PageHead, Pagination, SectionHead } from "@/components/ui/bits";
import { dealCategoryCounts, dealFacets, listDeals, listFeaturedDeals, type DealSort } from "@/data/repository";
import { categoryParam, enumParam, pageParam, slugParam, withQuery, type SearchParams } from "@/lib/params";
import { pageMeta } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

const SORTS: readonly DealSort[] = ["verified", "ending", "brand"];
// Only checked deals are listed, so the filter chooses between the two kinds of check.
const STATUSES = ["checkout_tested", "source_verified"] as const;

function readFilters(sp: SearchParams) {
  return {
    category: categoryParam(sp),
    brand: slugParam(sp, "brand"),
    verification: enumParam(sp, "status", STATUSES),
    sort: enumParam(sp, "sort", SORTS),
    page: pageParam(sp),
  };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = readFilters(await searchParams);
  const filtered = Boolean(f.category || f.brand || f.verification || f.sort);
  return pageMeta({
    title: f.page > 1 ? `AI and software deals, page ${f.page}` : "AI and software deals and discount codes",
    description: "Active discount codes and deals for AI tools and software. Each shows its source check status, conditions and end date.",
    // Filtered and sorted views are the same deals in another order: they point at the plain list and stay out of the index.
    path: filtered ? "/deals/" : withQuery("/deals/", { page: f.page }),
    noindex: filtered,
  });
}

export default async function DealsPage({ searchParams }: Props) {
  const f = readFilters(await searchParams);
  const [result, facets, featured, categoryCounts, all] = await Promise.all([listDeals(f), dealFacets(), listFeaturedDeals(), dealCategoryCounts(), listDeals()]);
  const q = { category: f.category, brand: f.brand, status: f.verification, sort: f.sort };
  const filtered = Boolean(f.category || f.brand || f.verification);

  return (
    <div className="container">
      <PageHead
        crumbs={[{ name: "Home", path: "/" }, { name: "Deals", path: "/deals/" }]}
        title="Deals and discount codes"
        lede="Only codes we have checked are listed. Each shows the discount, how and when it was checked, its conditions and when it ends."
      />

      {featured.length > 0 && !filtered && !f.sort && f.page === 1 ? (
        <section className="deals-block" aria-labelledby="featured-deals">
          <SectionHead id="featured-deals" title="Featured deals" intro="Picked by our editors. Checked deals come first, then the ones ending soonest." />
          <ul className="ticket-band">
            {featured.map((d, i) => (
              <DealTicket key={d.id} deal={d} variant={i === 0 ? "lead" : "side"} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="deals-block" aria-labelledby="all-deals">
        <SectionHead id="all-deals" title="All deals" intro="Every active code, grouped by what the tool does." />
        <ChipRail
          label="Deal categories"
          items={[
            { href: withQuery("/deals/", { ...q, category: undefined }), label: "All", count: all.total, current: !f.category },
            ...categoryCounts.map((c) => ({ href: withQuery("/deals/", { ...q, category: c.slug }), label: c.name, count: c.count, current: f.category === c.slug })),
          ]}
        />

      <form className="filters" action="/deals/" method="get" aria-label="Filter deals">
        {f.category ? <input type="hidden" name="category" value={f.category} /> : null}
        <div className="field">
          <label htmlFor="f-brand">Brand</label>
          <select id="f-brand" name="brand" className="select" defaultValue={f.brand ?? ""}>
            <option value="">All brands</option>
            {facets.brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Check status</label>
          <select id="f-status" name="status" className="select" defaultValue={f.verification ?? ""}>
            <option value="">Any check</option>
            <option value="checkout_tested">Tested at checkout</option>
            <option value="source_verified">Source checked</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-sort">Sort by</label>
          <select id="f-sort" name="sort" className="select" defaultValue={f.sort ?? "verified"}>
            <option value="verified">Most recently checked</option>
            <option value="ending">Ending soonest</option>
            <option value="brand">Brand A to Z</option>
          </select>
        </div>
        <button type="submit" className="btn btn-dark">
          Apply
        </button>
        {filtered || f.sort ? (
          <Link href="/deals/" className="text-link" style={{ alignSelf: "center" }}>
            Clear filters
          </Link>
        ) : null}
        <AutoSubmit />
      </form>

      <p className="result-count" role="status">
        {result.total === 1 ? "1 deal" : `${result.total} deals`}
        {filtered ? " match these filters" : ""}
      </p>

      {result.items.length > 0 ? (
        <>
          <DealList deals={result.items} />
          <Pagination page={result.page} totalPages={result.totalPages} href={(n) => withQuery("/deals/", { ...q, page: n })} />
        </>
      ) : filtered ? (
        <EmptyState
          title="No deals match"
          actions={
            <Link className="btn btn-primary" href="/deals/">
              Show all deals
            </Link>
          }
        >
          No active deal fits these filters. Remove a filter to see more.
        </EmptyState>
      ) : (
        <EmptyState
          title="No active deals yet"
          actions={
            <Link className="btn btn-primary" href="/tools/">
              Explore AI tools
            </Link>
          }
        >
          There are no deals to show right now. New codes are added after their source is recorded.
        </EmptyState>
      )}
      </section>
    </div>
  );
}
