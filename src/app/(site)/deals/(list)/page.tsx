import type { Metadata } from "next";
import Link from "next/link";
import { DealsMarket } from "@/components/deals/DealsMarket";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import { Breadcrumbs } from "@/components/ui/bits";
import { getDealsMarket, listFeaturedDeals } from "@/data/repository";
import { FEATURED_LIMIT } from "@/lib/featured";
import { one, type SearchParams } from "@/lib/params";
import { parseMarketState } from "@/lib/market";
import { pageMeta } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

/** Query keys that change what the page lists. Any of them makes the URL a filtered duplicate of /deals/. */
const STATE_KEYS = ["view", "q", "category", "brand", "check", "status", "sort", "page"];

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  return pageMeta({
    title: "AI Tool Deals & Coupon Codes",
    description:
      "Coupon codes and deals for AI tools, each with its conditions, end date and how it was checked. A code is listed only after it was checked.",
    // One canonical page; searched, filtered and sorted views point at it and stay out of the index.
    path: "/deals/",
    noindex: STATE_KEYS.some((k) => one(sp, k) !== ""),
  });
}

export default async function DealsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [market, featured] = await Promise.all([getDealsMarket(), listFeaturedDeals({ limit: FEATURED_LIMIT })]);
  const initial = parseMarketState((k) => one(sp, k, 200), market);
  // A visitor who arrives on a searched or filtered link came for the results: those lead.
  const arrivedFiltered = STATE_KEYS.some((k) => one(sp, k) !== "");

  return (
    <div className="container mk">
      <header className="mk-hero">
        <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Deals", path: "/deals/" }]} />
        <h1 className="mk-title">AI Tool Deals &amp; Coupon Codes</h1>
        <p className="mk-lede">
          Every deal shows its conditions, its end date and how we checked it. Links to brands may earn us a commission (
          <Link href="/affiliate-disclosure/">disclosure</Link>).
        </p>
      </header>

      {arrivedFiltered ? null : (
        <FeaturedDeals deals={featured} id="featured-deals" intro="Picked by our editors from deals we have checked." showAllLink={false} />
      )}

      <DealsMarket market={market} initial={initial} />
    </div>
  );
}
