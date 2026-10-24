import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { FixtureSource } from "@/data/sheets/fixture-source";
import { createSource, resetStore } from "@/data/store";
import { parseDay, isPast } from "@/lib/dates";
import { isIndexable } from "@/lib/env";
import { pageMeta } from "@/lib/seo";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

afterEach(() => vi.unstubAllEnvs());

describe("indexing rules", () => {
  it("indexes only a real https origin without NOINDEX", () => {
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: "https://deals.example.org" }))).toBe(true);
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: "https://deals.example.org", NOINDEX: "1" }))).toBe(false);
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: "http://deals.example.org" }))).toBe(false);
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: "http://localhost:3400" }))).toBe(false);
    expect(isIndexable(env({}))).toBe(false);
  });

  it("pageMeta sets canonical, OG and noindex", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://deals.example.org");
    const m = pageMeta({ title: "T", description: "D", path: "/deals/" });
    expect(m.alternates?.canonical).toBe("/deals/");
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(pageMeta({ title: "T", description: "D", path: "/x/", noindex: true }).robots).toEqual({ index: false, follow: true });
  });
});

describe("robots.txt", () => {
  it("blocks everything on non-production hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3400");
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });

  it("allows the site but not redirects, API and search in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://deals.example.org");
    const r = robots();
    expect(r.sitemap).toBe("https://deals.example.org/sitemap.xml");
    expect(r.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/go/", "/api/", "/search/"] }]);
  });
});

describe("sitemap.xml", () => {
  beforeEach(() => resetStore(new FixtureSource()));

  it("is empty on non-production hosts", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3400");
    expect(await sitemap()).toEqual([]);
  });

  it("lists only indexable URLs on the production host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://deals.example.org");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://deals.example.org/deals/quillwise-sample-q1/");
    expect(urls).toContain("https://deals.example.org/blog/how-to-check-a-software-coupon-code/");
    expect(urls.every((u) => u.startsWith("https://deals.example.org/") && u.endsWith("/"))).toBe(true);
    for (const bad of ["/go/", "/api/", "/search/", "quillwise-sample-q3", "codely-assist", "/categories/design/", "localhost"]) {
      expect(urls.some((u) => u.includes(bad)), bad).toBe(false);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("data source selection", () => {
  it("never serves sample data on a real domain", () => {
    expect(createSource(env({ DATA_SOURCE: "fixture", NEXT_PUBLIC_SITE_URL: "https://deals.example.org" })).kind).toBe("none");
    expect(createSource(env({ DATA_SOURCE: "fixture", NEXT_PUBLIC_SITE_URL: "http://localhost:3400" })).kind).toBe("fixture");
    expect(createSource(env({})).kind).toBe("none");
  });
});

describe("dates", () => {
  it("parses ISO days, timestamps and Sheets serial numbers only", () => {
    expect(parseDay("2026-10-22")).toBe("2026-10-22");
    expect(parseDay("2026-10-22T23:00:00Z")).toBe("2026-10-22");
    expect(parseDay("46317")).toBe("2026-10-22");
    expect(parseDay("10/11/2026")).toBeNull();
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("soon")).toBeNull();
  });

  it("treats the end date as inclusive", () => {
    const now = new Date("2026-10-22T20:00:00Z");
    expect(isPast("2026-10-22", now)).toBe(false);
    expect(isPast("2026-10-21", now)).toBe(true);
    expect(isPast(null, now)).toBe(false);
  });
});

describe("RSS feed", () => {
  it("escapes markup, formats dates for RSS, and stays valid when empty", async () => {
    const { buildFeed, rfc822 } = await import("@/lib/feed");
    expect(rfc822("2026-10-23")).toBe("Fri, 23 Oct 2026 00:00:00 GMT");
    const post = { id: "p", type: "blog", slug: "a-b", title: 'Tom & "Jerry" <script>', excerpt: "x < y", body: "", publishedAt: "2026-10-23", updatedAt: null, seoTitle: null, seoDescription: null, author: null, brandId: null, productId: null, productIds: [], status: "published" } as const;
    const xml = buildFeed("https://example.com", "Site & Co", "d", [post as never]);
    expect(xml).toContain("<title>Tom &amp; &quot;Jerry&quot; &lt;script&gt;</title>");
    expect(xml).toContain("<link>https://example.com/blog/a-b/</link>");
    expect(xml).toContain("<pubDate>Fri, 23 Oct 2026 00:00:00 GMT</pubDate>");
    expect(xml).not.toContain("<script>");
    const empty = buildFeed("https://example.com", "Site", "d", []);
    expect(empty).toContain("<channel>");
    expect(empty).not.toContain("<item>");
  });
});

describe("cover tones", () => {
  it("gives a category the same colours every time and every post its own glow position", async () => {
    const { toneOf, toneOfCategory, coverVars, TONES } = await import("@/lib/tone");
    expect(toneOf({ kind: "review", categories: ["ai-coding"] })).toBe(toneOfCategory("ai-coding"));
    expect(toneOf({ kind: "guide", categories: [] })).toBe(3);
    expect(toneOf({ kind: "review", categories: ["unknown"] })).toBe(3);
    const a = coverVars("alpha-review", 0) as Record<string, string>;
    expect(coverVars("alpha-review", 0)).toEqual(a);
    expect(coverVars("beta-review", 0)).not.toEqual(a);
    expect(a["--tone-a"]).toBe(TONES[0].a);
    expect(Number.parseInt(a["--gx"]!)).toBeGreaterThanOrEqual(15);
    expect(Number.parseInt(a["--gx"]!)).toBeLessThan(85);
  });
});
