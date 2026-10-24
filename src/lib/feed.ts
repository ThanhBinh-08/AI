import type { Post } from "@/types/catalog";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** YYYY-MM-DD → RFC 822 ("Fri, 23 Oct 2026 00:00:00 GMT"), as RSS 2.0 requires. */
export function rfc822(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toUTCString();
}

/** RSS 2.0 feed of the newest posts. An empty `posts` list gives a valid, empty channel. */
export function buildFeed(site: string, siteName: string, description: string, posts: Post[], limit = 50): string {
  const items = posts
    .filter((p) => p.publishedAt)
    .slice(0, limit)
    .map((p) => {
      const link = `${site}/blog/${p.slug}/`;
      return [
        "    <item>",
        `      <title>${esc(p.title)}</title>`,
        `      <link>${esc(link)}</link>`,
        `      <guid isPermaLink="true">${esc(link)}</guid>`,
        `      <pubDate>${rfc822(p.publishedAt!)}</pubDate>`,
        p.excerpt ? `      <description>${esc(p.excerpt)}</description>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${esc(`${siteName} blog`)}</title>`,
    `    <link>${esc(`${site}/blog/`)}</link>`,
    `    <description>${esc(description)}</description>`,
    "    <language>en-us</language>",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
