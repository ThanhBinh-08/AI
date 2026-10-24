import type { MetadataRoute } from "next";
import { STATIC_PAGES } from "@/content/pages";
import { sitemapData } from "@/data/repository";
import { getSiteUrl, isIndexable } from "@/lib/env";

export const revalidate = 300;

/**
 * Indexable URLs only: no search, /go/ redirects, API routes, filtered lists, expired deals, thin tool pages,
 * empty categories or empty compare/alternatives indexes. On a non-production host it is empty.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];
  const site = getSiteUrl();
  const d = await sitemapData();
  const url = (path: string, lastModified?: string | null, priority = 0.6): MetadataRoute.Sitemap[number] => ({
    url: `${site}${path}`,
    ...(lastModified ? { lastModified } : {}),
    priority,
  });
  return [
    url("/", null, 1),
    url("/deals/", null, 0.9),
    url("/tools/", null, 0.9),
    url("/brands/", null, 0.7),
    url("/categories/", null, 0.7),
    url("/blog/", null, 0.6),
    ...(d.comparisons.length > 0 ? [url("/compare/", null, 0.6)] : []),
    ...(d.alternatives.length > 0 ? [url("/alternatives/", null, 0.6)] : []),
    ...d.deals.map((x) => url(`/deals/${x.slug}/`, x.lastModified, 0.7)),
    ...d.brands.map((x) => url(`/brands/${x.slug}/`, x.lastModified, 0.8)),
    ...d.tools.map((slug) => url(`/tools/${slug}/`, null, 0.7)),
    ...d.categories.map((slug) => url(`/categories/${slug}/`, null, 0.7)),
    ...d.posts.map((x) => url(`/blog/${x.slug}/`, x.lastModified, 0.6)),
    ...d.comparisons.map((slug) => url(`/compare/${slug}/`, null, 0.6)),
    ...d.alternatives.map((slug) => url(`/alternatives/${slug}/`, null, 0.6)),
    ...STATIC_PAGES.map((p) => url(`/${p.slug}/`, p.updated, 0.3)),
    url("/contact/", null, 0.3),
  ];
}
