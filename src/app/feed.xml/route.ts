import { SITE } from "@/config/site";
import { listIndexablePosts } from "@/data/repository";
import { getSiteUrl, isIndexable } from "@/lib/env";
import { buildFeed } from "@/lib/feed";

export const revalidate = 300;

/** RSS of the newest posts. Staging and local hosts get an empty channel, like the sitemap. */
export async function GET() {
  const posts = isIndexable() ? await listIndexablePosts() : [];
  const xml = buildFeed(getSiteUrl(), SITE.name, "Guides, comparisons and reviews on choosing AI tools.", posts);
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
