import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { isIndexable } from "@/lib/env";
import { clip } from "@/lib/text";

export interface PageMetaInput {
  title: string;
  description: string;
  /** Path with trailing slash, e.g. "/deals/". Resolved against metadataBase. */
  path: string;
  noindex?: boolean;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string | null;
  modifiedTime?: string | null;
}

/**
 * Metadata for one page: title (the layout template adds the site name), description, canonical,
 * Open Graph and Twitter card. Pages are noindex when asked, and always on non-production hosts.
 */
export function pageMeta(o: PageMetaInput): Metadata {
  const description = clip(o.description);
  const image = o.image ?? "/media/og-default.jpg";
  const noindex = o.noindex || !isIndexable();
  return {
    title: o.title,
    description,
    alternates: { canonical: o.path },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: o.title,
      description,
      url: o.path,
      siteName: SITE.name,
      locale: SITE.locale,
      type: o.type ?? "website",
      images: [{ url: image }],
      ...(o.type === "article" && o.publishedTime ? { publishedTime: o.publishedTime } : {}),
      ...(o.type === "article" && o.modifiedTime ? { modifiedTime: o.modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: o.title, description, images: [image] },
  };
}
