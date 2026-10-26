import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealList, PostTile, ToolTile } from "@/components/cards/cards";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import { BrandLogo, Breadcrumbs, EmptyState, GoLink, JsonLd } from "@/components/ui/bits";
import { categoryBySlug } from "@/config/categories";
import { getBrand, listFeaturedDeals } from "@/data/repository";
import { getSiteUrl } from "@/lib/env";
import { breadcrumbs } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getBrand((await params).slug);
  if (!data) return { title: "Brand not found", robots: { index: false } };
  const { brand, deals } = data;
  return pageMeta({
    title: deals.length > 0 ? `${brand.name} deals and discount codes` : brand.name,
    description:
      deals.length > 0
        ? `${deals.length} active ${brand.name} ${deals.length === 1 ? "deal" : "deals"}, with check status, conditions and end dates. ${brand.description}`
        : brand.description || `${brand.name} in the AI tools directory.`,
    path: `/brands/${brand.slug}/`,
    image: brand.logoUrl,
  });
}

export default async function BrandPage({ params }: Props) {
  const data = await getBrand((await params).slug);
  if (!data) notFound();
  const { brand, deals, expired, tools, comparisons } = data;
  // Featured deals of other brands, same categories first (this brand's own deals are listed above them).
  const featured = await listFeaturedDeals({ categories: brand.categories, exclude: deals.map((d) => d.id) });
  const otherFeatured = featured.filter((d) => d.brandId !== brand.id);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Brands", path: "/brands/" },
    { name: brand.name, path: `/brands/${brand.slug}/` },
  ];

  return (
    <div className="container">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />
      <header className="page-head">
        <Breadcrumbs items={crumbs} />
        <div className="deal-hero" style={{ marginTop: 28 }}>
          <BrandLogo name={brand.name} src={brand.logoUrl} size="lg" />
          <div>
            <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 60px)" }}>
              {brand.name}
            </h1>
            {brand.categories.length > 0 ? (
              <ul className="chips" style={{ marginTop: 12 }}>
                {brand.categories.map((c) => (
                  <li key={c}>
                    <Link className="chip" href={`/categories/${c}/`}>
                      {categoryBySlug(c)?.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {brand.description ? (
          <p className="lede" style={{ marginTop: 20 }}>
            {brand.description}
          </p>
        ) : null}
        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <GoLink brandId={brand.id} enabled={brand.hasAffiliate} from="brand">
            Visit {brand.name}
          </GoLink>
          {brand.hasAffiliate ? (
            <span className="muted" style={{ fontSize: 13 }}>
              Affiliate link, no discount implied. <Link href="/affiliate-disclosure/">Disclosure</Link>
            </span>
          ) : null}
        </div>
      </header>

      <section className="section">
        <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
          Active {brand.name} deals
        </h2>
        {deals.length > 0 ? (
          <DealList deals={deals} />
        ) : (
          <EmptyState title="No active deals" actions={<Link className="btn btn-ghost" href="/deals/">See all deals</Link>}>
            There is no active {brand.name} deal right now.
          </EmptyState>
        )}
      </section>

      <FeaturedDeals className="section" deals={otherFeatured} id="brand-featured" />

      {tools.length > 0 ? (
        <section className="section">
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            {brand.name} tools
          </h2>
          <ul className="tiles">
            {tools.map((t) => (
              <ToolTile key={t.id} tool={{ ...t, brand, activeDeals: deals.length }} />
            ))}
          </ul>
        </section>
      ) : null}

      {comparisons.length > 0 ? (
        <section className="section">
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            Comparisons
          </h2>
          <ul className="tiles">
            {comparisons.map((p) => (
              <PostTile key={p.id} post={p} base="/compare/" />
            ))}
          </ul>
        </section>
      ) : null}

      {expired.length > 0 ? (
        <section className="section">
          <h2 className="subhead-s">Ended deals</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            Kept for reference. Their codes are hidden.
          </p>
          <DealList deals={expired} />
        </section>
      ) : null}
    </div>
  );
}
