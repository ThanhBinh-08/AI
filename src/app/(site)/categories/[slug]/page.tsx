import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandTile, DealList, ToolTile } from "@/components/cards/cards";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import { JsonLd, PageHead } from "@/components/ui/bits";
import { getCategory, listFeaturedDeals } from "@/data/repository";
import { getSiteUrl } from "@/lib/env";
import { breadcrumbs } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getCategory((await params).slug);
  if (!data) return { title: "Category not found", robots: { index: false } };
  const { category, deals, tools } = data;
  return pageMeta({
    title: `${category.name} tools and deals`,
    description: `${category.intro} ${tools.length} ${tools.length === 1 ? "tool" : "tools"} and ${deals.length} active ${deals.length === 1 ? "deal" : "deals"}.`,
    path: `/categories/${category.slug}/`,
  });
}

// An unknown slug, or a category with nothing published in it, is a 404 (no empty keyword pages).
export default async function CategoryPage({ params }: Props) {
  const data = await getCategory((await params).slug);
  if (!data) notFound();
  const { category, deals, tools, brands } = data;
  const featured = await listFeaturedDeals({ categories: [category.slug] });
  const featuredIds = new Set(featured.map((d) => d.id));
  const otherDeals = deals.filter((d) => !featuredIds.has(d.id));
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Categories", path: "/categories/" },
    { name: category.name, path: `/categories/${category.slug}/` },
  ];

  return (
    <div className="container">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />
      <PageHead crumbs={crumbs} title={category.name} lede={category.intro} />

      <FeaturedDeals className="section" deals={featured} id="category-featured" />

      {tools.length > 0 ? (
        <section className="section">
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            Tools
          </h2>
          <ul className="tiles">
            {tools.map((t) => (
              <ToolTile key={t.id} tool={t} />
            ))}
          </ul>
        </section>
      ) : null}

      {otherDeals.length > 0 ? (
        <section className="section">
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            {featured.length > 0 ? "More active deals" : "Active deals"}
          </h2>
          <DealList deals={otherDeals} />
        </section>
      ) : null}

      {brands.length > 0 ? (
        <section className="section">
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            Brands
          </h2>
          <ul className="tiles">
            {brands.map((b) => (
              <BrandTile
                key={b.id}
                brand={b}
                deals={deals.filter((d) => d.brandId === b.id).length}
                tools={tools.filter((t) => t.brandId === b.id).length}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
