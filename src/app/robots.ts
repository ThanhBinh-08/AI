import type { MetadataRoute } from "next";
import { getSiteUrl, isIndexable } from "@/lib/env";

/**
 * Production: everything except redirects, API routes and search results (which carry noindex as well).
 * Any other host (staging, preview, localhost): nothing.
 */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  if (!isIndexable()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/go/", "/api/", "/search/"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
