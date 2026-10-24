import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, PageHead } from "@/components/ui/bits";
import { STATIC_PAGES, staticPage } from "@/content/pages";
import { formatDay } from "@/lib/dates";
import { getSiteUrl } from "@/lib/env";
import { breadcrumbs } from "@/lib/jsonld";
import { Markdown } from "@/lib/markdown";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ page: string }> };

// Only the pages in src/content/pages.ts exist; any other top-level slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return STATIC_PAGES.map((p) => ({ page: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = staticPage((await params).page);
  if (!page) return {};
  return pageMeta({ title: page.title, description: page.description, path: `/${page.slug}/` });
}

export default async function StaticPageRoute({ params }: Props) {
  const page = staticPage((await params).page);
  if (!page) notFound();
  const crumbs = [
    { name: "Home", path: "/" },
    { name: page.title, path: `/${page.slug}/` },
  ];
  return (
    <div className="container">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />
      <PageHead crumbs={crumbs} title={page.title}>
        <p className="meta-line">Last updated {formatDay(page.updated)}</p>
      </PageHead>
      <div className="prose">
        <Markdown source={page.body} />
      </div>
    </div>
  );
}
