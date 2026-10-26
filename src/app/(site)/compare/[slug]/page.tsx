import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealList } from "@/components/cards/cards";
import { CompareTable } from "@/components/compare/CompareTable";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import { JsonLd, PageHead } from "@/components/ui/bits";
import { getComparison, listFeaturedDeals } from "@/data/repository";
import { formatDay } from "@/lib/dates";
import { getSiteUrl } from "@/lib/env";
import { breadcrumbs } from "@/lib/jsonld";
import { Markdown } from "@/lib/markdown";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getComparison((await params).slug);
  if (!data) return { title: "Comparison not found", robots: { index: false } };
  const { post, tools } = data;
  return pageMeta({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? (post.excerpt || `${tools.map((t) => t.name).join(" vs ")}: features, checked prices and deals side by side.`),
    path: `/compare/${post.slug}/`,
  });
}

export default async function ComparisonPage({ params }: Props) {
  const data = await getComparison((await params).slug);
  if (!data) notFound();
  const { post, tools, deals } = data;
  const featured = await listFeaturedDeals({
    brandIds: tools.map((t) => t.brandId),
    categories: [...new Set(tools.flatMap((t) => t.categories))],
    exclude: deals.map((d) => d.id),
    limit: 3,
  });
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Compare", path: "/compare/" },
    { name: post.title, path: `/compare/${post.slug}/` },
  ];

  return (
    <div className="container">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />
      <PageHead crumbs={crumbs} title={post.title} lede={post.excerpt || undefined}>
        <div className="meta-line">
          {post.updatedAt || post.publishedAt ? <span>Updated {formatDay((post.updatedAt ?? post.publishedAt)!)}</span> : null}
          {post.author ? <span>By {post.author}</span> : null}
        </div>
      </PageHead>

      <p className="notice" style={{ marginBottom: 28 }}>
        How to read this: every cell comes from our directory entry for that tool. Prices show the date they were checked; &quot;Not reviewed
        yet&quot; means we have no checked information, not that the feature is missing. We may earn a commission from links on this page (
        <Link href="/affiliate-disclosure/">disclosure</Link>).
      </p>

      <CompareTable tools={tools} caption={post.title} />

      {post.body ? (
        <section className="section">
          <div className="prose">
            <Markdown source={post.body} />
          </div>
        </section>
      ) : null}

      {deals.length > 0 ? (
        <section className="section">
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            Deals for these tools
          </h2>
          <DealList deals={deals} />
        </section>
      ) : null}

      <FeaturedDeals className="section" deals={featured} id="compare-featured" />
    </div>
  );
}
