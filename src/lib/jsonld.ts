import { SITE } from "@/config/site";
import type { Post } from "@/types/catalog";

/**
 * JSON-LD builders. They only describe what the page shows: no ratings, reviews, prices or availability
 * are ever added, and nothing claims a relationship with the brands listed.
 */

export interface Crumb {
  name: string;
  path: string;
}

export function organization(site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site}/#organization`,
    name: SITE.name,
    url: `${site}/`,
    logo: `${site}/brand/logo.webp`,
  };
}

export function website(site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site}/#website`,
    name: SITE.name,
    url: `${site}/`,
    publisher: { "@id": `${site}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${site}/search/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbs(site: string, items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${site}${c.path}` })),
  };
}

export function article(site: string, post: Post, path: string, opts: { image?: string | null } = {}) {
  // A Person only when the Sheet names someone other than the site; the site's own byline is the Organization.
  const person = post.author && post.author.trim().toLowerCase() !== SITE.name.toLowerCase() ? post.author.trim() : null;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    mainEntityOfPage: `${site}${path}`,
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt } : post.publishedAt ? { dateModified: post.publishedAt } : {}),
    author: person ? { "@type": "Person", name: person } : { "@id": `${site}/#organization` },
    publisher: { "@id": `${site}/#organization` },
    image: opts.image ? new URL(opts.image, site).toString() : `${site}/media/og-default.jpg`,
  };
}

/** JSON for a <script type="application/ld+json">: "<" is escaped so data can never close the tag. */
export function serializeJsonLd(data: unknown): string {
  // Writes the six characters \u003c (etc.), which JSON parsers read back as the original character.
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
