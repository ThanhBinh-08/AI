import { beforeEach, describe, expect, it, vi } from "vitest";
import { adaptNormalized, emptyNormalized, type NormalizedRaw } from "@/data/normalized/adapt";
import { CATEGORY_SEED, HEADERS, NORMALIZED_TABS, TOOL_EDITORIAL_COLUMNS } from "@/data/normalized/schema";
import { getBlogPost, getTool, listIndexablePosts, sitemapData, withoutSignalSections } from "@/data/repository";
import type { RawTabs, SheetSource } from "@/data/sheets/source";
import { resetStore } from "@/data/store";
import { article } from "@/lib/jsonld";
import type { Post } from "@/types/catalog";

const NOW = new Date("2026-10-23T00:00:00Z");
type Tab = (typeof NORMALIZED_TABS)[number];

const LONG = Array.from({ length: 320 }, (_, i) => `word${i}`).join(" ");
const SIGNALS = "## Public signals on 2026-10-23\n\n- **49,705** GitHub stars\n\nRanked #49 of 257 tools (evidence score 69 out of 100).";

/** Fictional normalized workbook; editorial columns are appended to Tools like an owner would add them by hand. */
function workbook(): NormalizedRaw {
  const raw = emptyNormalized();
  const table = (tab: Tab, rows: Record<string, string>[], extra: readonly string[] = []) => {
    const header = [...HEADERS[tab], ...extra];
    raw[tab] = [header, ...rows.map((r) => header.map((h) => r[h] ?? ""))];
  };
  table("Categories", CATEGORY_SEED.map((c, i) => ({ category_id: c.id, category_name: c.name, slug: c.slug, display_order: String(i + 1), status: "active" })));
  const editorial = { features: "Drafts from outlines|Tone rewrite", use_cases: "Blog posts", platforms: "web|mac", pros: "Fast", cons: "No offline mode" };
  table(
    "Tools",
    [
      // Checked, real (fictional for the test), with an approved affiliate URL.
      { tool_id: "T0001", name: "Checked Writer", slug: "checked-writer", short_description: "Writes.", official_url: "https://writer.test-brand.io", affiliate_url: "https://writer.test-brand.io/?ref=me", logo_url: "https://img.logo.dev/writer.test-brand.io?token=pk_x", publish_status: "published", data_source_type: "manually_entered", verification_status: "verified", updated_at: "2026-10-01", source_name: "Brand site", ...editorial },
      // Published but not checked: editorial columns must not show.
      { tool_id: "T0002", name: "Listed Writer", slug: "listed-writer", short_description: "Also writes.", official_url: "https://listed.test-brand.io", publish_status: "published", data_source_type: "manually_entered", verification_status: "unverified", source_name: "AI Use Cases (aiusecases.dev, CC BY 4.0)", source_url: "https://aiusecases.dev/tool/listed/", ...editorial },
      // Fictional sample row that claims to be verified.
      { tool_id: "T0003", name: "Fake Writer", slug: "fake-writer", short_description: "Sample.", official_url: "https://www.fake.example.com", publish_status: "preview", data_source_type: "preview_import", verification_status: "verified", source_name: "Fictional sample", ...editorial },
    ],
    TOOL_EDITORIAL_COLUMNS,
  );
  table("Tool_Categories", ["T0001", "T0002", "T0003"].map((id) => ({ tool_category_id: `TC-${id}`, tool_id: id, category_id: "CAT001", is_primary: "TRUE" })));
  table("Tool_Alternatives", []);
  table("Deals", [
    { deal_id: "D1", tool_id: "T0001", title: "Annual plan", coupon_code: "SAVE20", discount: "20% off", verification_status: "verified", publish_status: "published", updated_at: "2026-10-20", expires_at: "2027-01-01" },
    { deal_id: "D2", tool_id: "T0001", title: "Unchecked offer", discount: "10% off", verification_status: "unverified", publish_status: "published", expires_at: "2027-01-01" },
    { deal_id: "D3", tool_id: "T0003", title: "Sample deal", coupon_code: "SAMPLE", discount: "50% off", verification_status: "verified", publish_status: "preview", updated_at: "2026-10-20", expires_at: "2027-01-01" },
  ]);
  table("Blog_Posts", [
    { post_id: "REV-T0002", title: "Listed Writer review", slug: "listed-writer-review", excerpt: "Profile.", content: `*This review summarizes public information.*\n\n## What it does\n\nWrites.\n\n${SIGNALS}\n\n## Before you choose\n\nCheck the site. ${LONG}`, author: "AI Tools & Deals", published_at: "2026-10-23", status: "published", seo_title: "Listed Writer review: pricing", post_type: "review", tool_id: "T0002" },
    { post_id: "REV-T0001", title: "Checked Writer review", slug: "checked-writer-review", excerpt: "Hands-on.", content: `## Setup\n\n${LONG}\n\n## Results\n\nGood.`, author: "Jane Tester", published_at: "2026-10-22", status: "published", post_type: "review", tool_id: "T0001" },
    { post_id: "G1", title: "Short guide", slug: "short-guide", excerpt: "Thin.", content: "## One\n\nToo short.", published_at: "2026-10-21", status: "published", post_type: "guide" },
    { post_id: "S1", title: "Sample post", slug: "sample-post", excerpt: "Sample.", content: LONG, author: "Sample (fictional)", published_at: "2026-10-21", status: "published", post_type: "guide" },
  ]);
  table("Settings", []);
  table("Import_Log", []);
  return raw;
}

function useWorkbook(allowPreview: boolean) {
  const { tabs, issues } = adaptNormalized(workbook(), { allowPreview, now: NOW });
  const source: SheetSource = { kind: "fixture", fetchTabs: async (): Promise<RawTabs> => tabs, adapterIssues: issues };
  resetStore(source);
}

beforeEach(() => {
  vi.stubEnv("AFFILIATE_EXTRA_HOSTS", "");
  useWorkbook(true);
});

describe("tool page data", () => {
  it("shows editorial lists, platforms and checked deals only for a verified tool", async () => {
    const page = (await getTool("checked-writer"))!;
    expect(page.tool.verified).toBe(true);
    expect(page.tool.features).toEqual(["Drafts from outlines", "Tone rewrite"]);
    expect(page.tool.platforms).toEqual(["web", "mac"]);
    expect(page.tool.brand.hasAffiliate).toBe(true);
    expect(page.deals.map((d) => d.id)).toEqual(["D1"]);
    expect(page.uncheckedDeals).toBe(1);
    expect(page.tool.imageUrl).toBe("https://img.logo.dev/writer.test-brand.io?token=pk_x");
  });

  it("hides editorial lists of an unchecked tool and keeps its listing source", async () => {
    const page = (await getTool("listed-writer"))!;
    expect(page.tool.verified).toBe(false);
    expect(page.tool.features).toEqual([]);
    expect(page.tool.platforms).toEqual([]);
    expect(page.tool.pros).toEqual([]);
    expect(page.tool.brand.hasAffiliate).toBe(false);
    expect(page.tool.listingSource).toEqual({ name: "AI Use Cases (aiusecases.dev, CC BY 4.0)", url: "https://aiusecases.dev/tool/listed/" });
    expect(page.tool.officialUrl).toBe("https://listed.test-brand.io/");
  });

  it("never treats sample data as verified, even when the row says so", async () => {
    const page = (await getTool("fake-writer"))!;
    expect(page.tool.brand.sample).toBe(true);
    expect(page.tool.verified).toBe(false);
    expect(page.tool.features).toEqual([]);
    expect(page.deals).toEqual([]);
    expect(page.uncheckedDeals).toBe(1);
    expect(page.related.every((t) => t.brand.sample)).toBe(true);
  });

  it("lists only checked, non-sample tools with content in the sitemap", async () => {
    expect((await sitemapData()).tools).toEqual(["checked-writer"]);
  });
});

describe("blog posts", () => {
  it("turns a review of an unchecked tool into a noindex tool profile without ranking signals", async () => {
    const { post } = (await getBlogPost("listed-writer-review"))!;
    expect(post.directoryProfile).toBe(true);
    expect(post.indexable).toBe(false);
    expect(post.title).toBe("Listed Writer profile");
    expect(post.seoTitle).toBe("Listed Writer profile: pricing");
    expect(post.body).not.toMatch(/Public signals|evidence score|GitHub stars/);
    expect(post.body).toContain("This profile summarizes");
    expect(post.body).toContain("## Before you choose");
  });

  it("keeps a written review of a checked tool as a review, indexable, with the tool logo from tool_id", async () => {
    const { post, deals } = (await getBlogPost("checked-writer-review"))!;
    expect(post.directoryProfile).toBe(false);
    expect(post.kind).toBe("review");
    expect(post.indexable).toBe(true);
    expect(post.tool?.logoUrl).toBe("https://img.logo.dev/writer.test-brand.io?token=pk_x");
    expect(deals.map((d) => d.id)).toEqual(["D1"]);
  });

  it("keeps thin and sample posts out of the index and hides sample bylines", async () => {
    expect((await getBlogPost("short-guide"))!.post.indexable).toBe(false);
    const sample = (await getBlogPost("sample-post"))!.post;
    expect(sample.indexable).toBe(false);
    expect(sample.author).toBeNull();
    const slugs = (await listIndexablePosts()).map((p) => p.slug);
    expect(slugs).toContain("checked-writer-review");
    expect(slugs).not.toContain("listed-writer-review");
    expect(slugs).not.toContain("short-guide");
    expect(slugs).not.toContain("sample-post");
    expect((await sitemapData()).posts.map((p) => p.slug)).toEqual(slugs);
  });

  it("suggests written articles before directory profiles", async () => {
    const { related } = (await getBlogPost("checked-writer-review"))!;
    expect(related.every((p) => !p.directoryProfile)).toBe(true);
  });
});

describe("helpers", () => {
  it("drops only the signal sections", () => {
    expect(withoutSignalSections(`Intro.\n\n## Pricing\n\nFree.\n\n${SIGNALS}\n\n## Before you choose\n\nCheck.`)).toBe("Intro.\n\n## Pricing\n\nFree.\n\n## Before you choose\n\nCheck.");
  });

  it("uses the Organization as author when the byline is the site itself", () => {
    const base: Omit<Post, "author"> = { id: "x", type: "blog", slug: "x", title: "X", excerpt: "", body: "", seoTitle: null, seoDescription: null, publishedAt: "2026-10-01", updatedAt: null, brandId: null, productId: null, productIds: [], status: "published" };
    expect(article("https://s.test", { ...base, author: "AI Tools & Deals" }, "/blog/x/").author).toEqual({ "@id": "https://s.test/#organization" });
    expect(article("https://s.test", { ...base, author: "Jane Tester" }, "/blog/x/").author).toEqual({ "@type": "Person", name: "Jane Tester" });
  });
});
