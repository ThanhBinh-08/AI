import type { Metadata } from "next";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealList } from "@/components/cards/cards";
import { CompareTable } from "@/components/compare/CompareTable";
import { JsonLd, PageHead } from "@/components/ui/bits";
import { getAlternatives, listFeaturedDeals } from "@/data/repository";
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
  const data = await getAlternatives((await params).slug);
  if (!data) return { title: "Page not found", robots: { index: false } };
  const { post, subject, alternatives } = data;
  return pageMeta({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? (post.excerpt || `${alternatives.length} alternatives to ${subject.name}, compared on checked features and prices.`),
    path: `/alternatives/${post.slug}/`,
    // Without written selection criteria the page is only a list; keep it out of the index until it has them.
    noindex: !post.body.trim(),
  });
}

export default async function AlternativesPage({ params }: Props) {
  const data = await getAlternatives((await params).slug);
  if (!data) notFound();
  const { post, subject, alternatives, deals } = data;
  const featured = await listFeaturedDeals({
    categories: [...new Set([subject, ...alternatives].flatMap((t) => t.categories))],
    exclude: deals.map((d) => d.id),
  });
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Alternatives", path: "/alternatives/" },
    { name: post.title, path: `/alternatives/${post.slug}/` },
  ];

  return (
    <div className="container">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />
      <PageHead crumbs={crumbs} title={post.title} lede={post.excerpt || undefined}>
        <div className="meta-line">
          {post.updatedAt || post.publishedAt ? <span>Updated {formatDay((post.updatedAt ?? post.publishedAt)!)}</span> : null}
          <span>
            Instead of <Link href={`/tools/${subject.slug}/`}>{subject.name}</Link>
          </span>
        </div>
      </PageHead>

      {post.body ? (
        <section style={{ marginBottom: 36 }}>
          <div className="prose">
            <Markdown source={post.body} />
          </div>
        </section>
      ) : null}

      <CompareTable tools={[subject, ...alternatives]} caption={`${subject.name} and its alternatives`} />
      <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>
        Cells come from our directory entries. We may earn a commission from links on this page (
        <Link href="/affiliate-disclosure/">disclosure</Link>).
      </p>

      {deals.length > 0 ? (
        <section className="section">
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            Deals on these alternatives
          </h2>
          <DealList deals={deals} />
        </section>
      ) : null}
      <FeaturedDeals className="section" deals={featured} id="page-featured" />
    </div>
  );
}
