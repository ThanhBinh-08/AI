import { describe, expect, it } from "vitest";
import { adaptNormalized, checkIntegrity, emptyNormalized, looksNormalized, type NormalizedRaw } from "@/data/normalized/adapt";
import { applyPlan, integrityIssues, planImport, type CrawledInput } from "@/data/normalized/import";
import { CATEGORY_SEED, HEADERS, NORMALIZED_TABS } from "@/data/normalized/schema";
import { parseCatalog } from "@/data/schemas/parse";
import { oneSentence, parseToolPage, toolHandles } from "../../scripts/db/crawl-toolify";

const NOW = new Date("2026-10-23T00:00:00Z");

/** Fictional workbook in the normalized layout. */
function workbook(over: Partial<Record<(typeof NORMALIZED_TABS)[number], Record<string, string>[]>> = {}): NormalizedRaw {
  const raw = emptyNormalized();
  const table = (tab: (typeof NORMALIZED_TABS)[number], rows: Record<string, string>[]) => {
    raw[tab] = [[...HEADERS[tab]], ...rows.map((r) => HEADERS[tab].map((h) => r[h] ?? ""))];
  };
  table("Categories", over.Categories ?? CATEGORY_SEED.map((c, i) => ({ category_id: c.id, category_name: c.name, slug: c.slug, display_order: String(i + 1), status: "active" })));
  table("Tools", over.Tools ?? [
    { tool_id: "T0001", name: "Sample Writer", slug: "sample-writer", short_description: "Fictional writing tool.", official_url: "https://writer-tool.io", publish_status: "published", data_source_type: "manually_entered", verification_status: "verified", updated_at: "2026-10-01", affiliate_url: "https://writer-tool.io/?ref=me" },
    { tool_id: "T0002", name: "Sample Painter", slug: "sample-painter", short_description: "Fictional image tool.", official_url: "https://painter.example.com", source_name: "Fictional sample", publish_status: "preview", data_source_type: "preview_import", verification_status: "unverified" },
  ]);
  table("Tool_Categories", over.Tool_Categories ?? [
    { tool_category_id: "TC-T0001-CAT001", tool_id: "T0001", category_id: "CAT001", is_primary: "TRUE" },
    { tool_category_id: "TC-T0002-CAT002", tool_id: "T0002", category_id: "CAT002", is_primary: "TRUE" },
  ]);
  table("Tool_Alternatives", over.Tool_Alternatives ?? []);
  table("Deals", over.Deals ?? []);
  table("Blog_Posts", over.Blog_Posts ?? []);
  table("Settings", over.Settings ?? []);
  table("Import_Log", over.Import_Log ?? []);
  return raw;
}

const messages = (raw: NormalizedRaw) => checkIntegrity(raw).issues.map((i) => `${i.tab}: ${i.message}`);

describe("integrity", () => {
  it("accepts a clean workbook", () => expect(messages(workbook())).toEqual([]));

  it("rejects duplicate and empty primary keys and duplicate slugs", () => {
    const raw = workbook({ Tools: [
      { tool_id: "T0001", name: "A", slug: "a", publish_status: "published" },
      { tool_id: "T0001", name: "B", slug: "b" },
      { tool_id: "", name: "C", slug: "c" },
      { tool_id: "T0004", name: "D", slug: "a" },
    ] });
    const m = messages(raw).join("\n");
    expect(m).toContain("duplicate tool_id T0001");
    expect(m).toContain("tool_id is empty");
    expect(m).toContain("duplicate slug a");
  });

  it("rejects dangling foreign keys, self-alternatives, duplicate pairs and a second primary category", () => {
    const raw = workbook({
      Tool_Categories: [
        { tool_category_id: "X1", tool_id: "T0001", category_id: "CAT001", is_primary: "TRUE" },
        { tool_category_id: "X2", tool_id: "T0001", category_id: "CAT001", is_primary: "FALSE" },
        { tool_category_id: "X3", tool_id: "T0001", category_id: "CAT002", is_primary: "TRUE" },
        { tool_category_id: "X4", tool_id: "T9999", category_id: "CAT001", is_primary: "TRUE" },
        { tool_category_id: "X5", tool_id: "T0001", category_id: "CAT999", is_primary: "FALSE" },
      ],
      Tool_Alternatives: [
        { alternative_id: "A1", tool_id: "T0001", alternative_tool_id: "T0001" },
        { alternative_id: "A2", tool_id: "T0001", alternative_tool_id: "T0777" },
      ],
      Deals: [{ deal_id: "D1", tool_id: "T0404", discount: "10%" }],
    });
    const m = messages(raw).join("\n");
    expect(m).toContain("duplicate pair T0001/CAT001");
    expect(m).toContain("already has a primary category");
    expect(m).toContain('tool_id "T9999" does not exist in Tools.tool_id');
    expect(m).toContain('category_id "CAT999" does not exist');
    expect(m).toContain("cannot be its own alternative");
    expect(m).toContain('alternative_tool_id "T0777" does not exist');
    expect(m).toContain('tool_id "T0404" does not exist');
  });

  it("rejects invalid URLs, bad enum values and missing names", () => {
    const raw = workbook({ Tools: [
      { tool_id: "T0001", name: "", slug: "a" },
      { tool_id: "T0002", name: "B", slug: "b", official_url: "javascript:alert(1)" },
      { tool_id: "T0003", name: "C", slug: "c", publish_status: "live" },
      { tool_id: "T0004", name: "D", slug: "d", logo_url: "http://insecure.example.com/x.png" },
    ] });
    const m = messages(raw).join("\n");
    expect(m).toContain("name is empty");
    expect(m).toContain("official_url is not a public https URL");
    expect(m).toContain('publish_status "live"');
    expect(m).toContain("logo_url is not a public https URL");
  });

  it("detects a category parent loop and a missing column", () => {
    const raw = workbook({ Categories: [
      { category_id: "CAT001", category_name: "A", slug: "a", parent_category_id: "CAT002" },
      { category_id: "CAT002", category_name: "B", slug: "b", parent_category_id: "CAT001" },
    ] });
    expect(messages(raw).join("\n")).toContain("forms a loop");
    raw.Deals = [["deal_id", "tool_id"], ["D1", "T0001"]];
    expect(messages(raw).join("\n")).toContain("missing column(s)");
  });
});

describe("adapter → site catalog", () => {
  it("detects the layout by the tool_id header", () => {
    expect(looksNormalized(workbook().Tools)).toBe(true);
    expect(looksNormalized([["brand_id", "name"]])).toBe(false);
  });

  it("hides preview rows unless explicitly allowed, and never gives them an affiliate CTA", () => {
    const hidden = parseCatalog(adaptNormalized(workbook(), { allowPreview: false, now: NOW }).tabs, NOW, []);
    expect(hidden.catalog.brands.find((b) => b.id === "T0002")?.status).toBe("draft");
    expect(hidden.catalog.brands.find((b) => b.id === "T0001")?.status).toBe("published");
    const shown = parseCatalog(adaptNormalized(workbook(), { allowPreview: true, now: NOW }).tabs, NOW, []);
    const preview = shown.catalog.brands.find((b) => b.id === "T0002")!;
    expect(preview.status).toBe("published");
    expect(preview.hasAffiliate).toBe(false);
  });

  it("links each tool to the URL in its own Tools row: affiliate_url when filled, else official_url; never for fictional rows", () => {
    const parsed = parseCatalog(adaptNormalized(workbook(), { allowPreview: true, now: NOW }).tabs, NOW, []);
    expect(parsed.catalog.brands.find((b) => b.id === "T0001")?.hasAffiliate).toBe(true);
    expect(parsed.affiliateUrls.get("T0001")).toBe("https://writer-tool.io/?ref=me");
    // T0002 is marked fictional (source_name): no outbound link even though it has an official_url.
    expect(parsed.affiliateUrls.has("T0002")).toBe(false);
    expect(parsed.catalog.brands.find((b) => b.id === "T0002")?.hasAffiliate).toBe(false);
  });

  it("uses official_url as the link when affiliate_url is empty, including imported (preview) tools", () => {
    const raw = workbook({ Tools: [
      { tool_id: "T0003", name: "Real Tool", slug: "real-tool", official_url: "https://realtool.ai/app", publish_status: "preview", data_source_type: "preview_import" },
      { tool_id: "T0004", name: "Other Tool", slug: "other-tool", official_url: "https://othertool.com", publish_status: "published", data_source_type: "manually_entered" },
    ] });
    const parsed = parseCatalog(adaptNormalized(raw, { allowPreview: true, now: NOW }).tabs, NOW, []);
    expect(parsed.affiliateUrls.get("T0003")).toBe("https://realtool.ai/app");
    expect(parsed.affiliateUrls.get("T0004")).toBe("https://othertool.com/");
    expect(parsed.catalog.brands.find((b) => b.id === "T0003")?.hasAffiliate).toBe(true);
  });

  it("maps category relationships and never renders an unverified price", () => {
    const parsed = parseCatalog(adaptNormalized(workbook(), { allowPreview: true, now: NOW }).tabs, NOW, []);
    expect(parsed.catalog.products.find((p) => p.id === "T0001")?.categories).toEqual(["ai-writing"]);
    expect(parsed.catalog.products.find((p) => p.id === "T0002")?.pricing).toBe("");
  });

  it("marks expired deals expired and keeps not-yet-started deals out", () => {
    const raw = workbook({ Deals: [
      { deal_id: "D1", tool_id: "T0001", discount: "20% off", publish_status: "published", expires_at: "2026-10-01" },
      { deal_id: "D2", tool_id: "T0001", discount: "30% off", publish_status: "published", expires_at: "2026-12-31" },
      { deal_id: "D3", tool_id: "T0001", discount: "40% off", publish_status: "published", starts_at: "2027-01-01" },
    ] });
    const { catalog } = parseCatalog(adaptNormalized(raw, { allowPreview: true, now: NOW }).tabs, NOW, []);
    expect(catalog.coupons.find((c) => c.id === "D1")?.status).toBe("expired");
    expect(catalog.coupons.find((c) => c.id === "D2")?.status).toBe("published");
    expect(catalog.coupons.find((c) => c.id === "D3")).toBeUndefined();
  });

  it("skips rows with broken foreign keys instead of breaking the catalog", () => {
    const raw = workbook({ Deals: [{ deal_id: "D1", tool_id: "T0404", discount: "10%", publish_status: "published" }] });
    const out = adaptNormalized(raw, { allowPreview: true, now: NOW });
    expect(out.issues.some((i) => i.tab === "Deals")).toBe(true);
    expect(parseCatalog(out.tabs, NOW, []).catalog.coupons).toEqual([]);
  });

  it("builds an alternatives page only from existing alternative rows", () => {
    expect(adaptNormalized(workbook(), { allowPreview: true, now: NOW }).tabs.Content.length).toBe(1);
    const raw = workbook({ Tool_Alternatives: [{ alternative_id: "A1", tool_id: "T0001", alternative_tool_id: "T0002", display_order: "1" }] });
    const content = adaptNormalized(raw, { allowPreview: true, now: NOW }).tabs.Content;
    expect(content[1]).toContain("alternatives");
    expect(content[1]).toContain("T0002");
  });
});

describe("preview import", () => {
  const crawled: CrawledInput[] = [
    { handle: "one", name: "One Tool", sourceUrl: "https://www.toolify.ai/tool/one", summary: "Does one thing.", officialUrl: "https://one.example.com", categorySlug: "ai-image" },
    { handle: "two", name: "Two Tool", sourceUrl: "https://www.toolify.ai/tool/two", summary: "Does two things.", officialUrl: null, categorySlug: "ai-video" },
    { handle: "bad", name: "Bad Tool", sourceUrl: "https://www.toolify.ai/tool/bad", summary: "", officialUrl: null, categorySlug: "unknown-cat" },
  ];

  it("inserts preview rows as unverified, with stable ids and valid relationships", () => {
    const plan = planImport(workbook({ Tools: [], Tool_Categories: [] }), crawled, NOW);
    expect(plan.inserted).toBe(2);
    expect(plan.failed).toHaveLength(1);
    const merged = applyPlan(workbook({ Tools: [], Tool_Categories: [] }), plan);
    expect(integrityIssues(merged)).toEqual([]);
    const tool = merged.Tools[1]!;
    const h = HEADERS.Tools;
    expect(tool[h.indexOf("tool_id")]).toBe("T0001");
    expect(tool[h.indexOf("data_source_type")]).toBe("preview_import");
    expect(tool[h.indexOf("verification_status")]).toBe("unverified");
    expect(tool[h.indexOf("publish_status")]).toBe("preview");
    expect(tool[h.indexOf("affiliate_url")]).toBe("");
    expect(tool[h.indexOf("pricing_model")]).toBe("unknown");
  });

  it("is idempotent and never overwrites an existing record", () => {
    const base = workbook({ Tools: [], Tool_Categories: [] });
    const once = applyPlan(base, planImport(base, crawled, NOW));
    const again = planImport(once, crawled, NOW);
    expect(again.inserted).toBe(0);
    expect(again.skipped).toHaveLength(2);
    const manual = workbook({ Tools: [{ tool_id: "T0001", name: "One Tool", slug: "one-tool", source_url: "", publish_status: "published", data_source_type: "manually_entered" }], Tool_Categories: [] });
    const plan = planImport(manual, crawled, NOW);
    expect(plan.skipped.some((s) => s.handle === "one" && /slug/.test(s.reason))).toBe(true);
    expect(plan.append.Tools!.every((r) => r[0] !== "T0001")).toBe(true);
  });
});

describe("Toolify page parsing", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "SoftwareApplication", name: "Demo Tool", description: "Demo Tool: Demo Tool is a fictional app. It does many more things that we do not copy.",
    aggregateRating: { ratingValue: "5" },
  })}</script></head><body><h1>Demo Tool</h1><div><a href="https://demo.example.com?utm_source=toolify" rel="dofollow" target="_blank">Visit</a></div>
  <a href="/tool/demo-tool">x</a><a href="/tool/other-one">y</a></body></html>`;

  it("extracts name, one-sentence summary and official URL without tracking, and no rating", () => {
    const t = parseToolPage(html, "demo-tool")!;
    expect(t.name).toBe("Demo Tool");
    expect(t.summary).toBe("Demo Tool is a fictional app.");
    expect(t.officialUrl).toBe("https://demo.example.com");
    expect(JSON.stringify(t)).not.toContain("rating");
  });

  it("returns null for pages without a SoftwareApplication block and lists tool handles once", () => {
    expect(parseToolPage("<html></html>", "x")).toBeNull();
    expect(toolHandles(html)).toEqual(["demo-tool", "other-one"]);
  });

  it("keeps summaries to 160 characters", () => {
    expect(oneSentence("A ".repeat(200)).length).toBeLessThanOrEqual(161);
  });
});

describe("aiusecases.dev mapping", () => {
  const data = {
    use_cases: [
      { slug: "a", category: "Coding" }, { slug: "b", category: "Audio" }, { slug: "c", category: "Games & 3D" },
    ],
    tools: [
      { slug: "bolt-new", name: "bolt.new", tagline: "Builds apps.", use_cases: ["a", "b"], pricing: "freemium", url: "https://bolt.new/" },
      { slug: "bolt-new-oss", name: "bolt.new", tagline: "Open version.", use_cases: ["a"], pricing: "open-source", url: "https://example.com/bolt" },
      { slug: "game-tool", name: "Game Tool", tagline: "x", use_cases: ["c"], pricing: "paid", url: "http://insecure.example.com" },
      { slug: "Bad Slug", name: "Bad", tagline: "", use_cases: [], pricing: "", url: "" },
    ],
  };

  it("maps categories and pricing without inventing values", async () => {
    const { mapAiUseCases } = await import("../../scripts/db/fetch-aiusecases");
    const out = mapAiUseCases(data);
    expect(out.tools).toHaveLength(3);
    expect(out.rejected).toHaveLength(1);
    const [bolt, oss, game] = out.tools;
    expect(bolt!.categorySlugs).toEqual(["ai-coding", "ai-audio"]);
    expect(bolt!.pricingModel).toBe("freemium");
    expect(oss!.pricingModel).toBe("unknown");
    expect(game!.categorySlugs).toEqual([]);
    expect(game!.officialUrl).toBeNull();
    expect(out.unmappedCategories).toEqual({ "Games & 3D": 1 });
  });

  it("imports same-named tools by source slug, with several categories and one primary, idempotently", async () => {
    const { mapAiUseCases } = await import("../../scripts/db/fetch-aiusecases");
    const tools = mapAiUseCases(data).tools;
    const base = workbook({ Tools: [], Tool_Categories: [] });
    const plan = planImport(base, tools, NOW);
    expect(plan.inserted).toBe(3);
    const merged = applyPlan(base, plan);
    expect(integrityIssues(merged)).toEqual([]);
    expect(merged.Tool_Categories.length - 1).toBe(3);
    expect(planImport(merged, tools, NOW).inserted).toBe(0);
    const parsed = parseCatalog(adaptNormalized(merged, { allowPreview: false, now: NOW }).tabs, NOW, []);
    expect(parsed.catalog.brands.every((b) => b.status === "draft")).toBe(true);
  });
});

describe("Next dynamic-usage passthrough", () => {
  it("recognises Next's dynamic-usage error and nothing else", async () => {
    const { isNextDynamicUsage } = await import("@/data/sheets/errors");
    expect(isNextDynamicUsage(Object.assign(new Error("x"), { digest: "DYNAMIC_SERVER_USAGE" }))).toBe(true);
    expect(isNextDynamicUsage(new Error("network down"))).toBe(false);
    expect(isNextDynamicUsage(null)).toBe(false);
  });
});

describe("featured tools", () => {
  it("carries Tools.featured to the brand so its deals can lead the Deals page", () => {
    const raw = workbook({ Tools: [
      { tool_id: "T0001", name: "A", slug: "a", publish_status: "published", featured: "TRUE" },
      { tool_id: "T0002", name: "B", slug: "b", publish_status: "published", featured: "FALSE" },
    ], Tool_Categories: [] });
    const { catalog } = parseCatalog(adaptNormalized(raw, { allowPreview: false, now: NOW }).tabs, NOW, []);
    expect(catalog.brands.find((b) => b.id === "T0001")?.featured).toBe(true);
    expect(catalog.brands.find((b) => b.id === "T0002")?.featured).toBeUndefined();
  });
});

describe("reviews (Blog_Posts → Tools)", () => {
  const withTools = (posts: Record<string, string>[]) =>
    workbook({
      Tools: [
        { tool_id: "T0001", name: "Alpha", slug: "alpha", source_url: "https://www.toolify.ai/tool/alpha", source_name: "Source A", publish_status: "published" },
        { tool_id: "T0002", name: "Beta", slug: "beta", source_url: "https://www.toolify.ai/tool/beta", publish_status: "preview" },
      ],
      Tool_Categories: [],
      Blog_Posts: posts,
    });
  const msgs = (raw: NormalizedRaw) => messages(raw).join("\n");

  it("accepts a review that names its tool by tool_id, by source_url, or by both when they agree", () => {
    const raw = withTools([
      { post_id: "REV-T0001", title: "Alpha review", slug: "alpha-review", post_type: "review", tool_id: "T0001" },
      { post_id: "REV-T0002", title: "Beta review", slug: "beta-review", post_type: "review", source_url: "https://www.toolify.ai/tool/beta" },
      { post_id: "P3", title: "Guide", slug: "guide", post_type: "guide" },
    ]);
    expect(messages(raw)).toEqual([]);
  });

  it("rejects a review without a tool, with an unknown tool, with conflicting keys, or a second review of one tool", () => {
    const m = msgs(withTools([
      { post_id: "P1", title: "No tool", slug: "no-tool", post_type: "review" },
      { post_id: "P2", title: "Ghost", slug: "ghost", post_type: "review", tool_id: "T9999" },
      { post_id: "P3", title: "Unknown source", slug: "unknown-source", post_type: "review", source_url: "https://www.toolify.ai/tool/nope" },
      { post_id: "P4", title: "Conflict", slug: "conflict", post_type: "guide", tool_id: "T0001", source_url: "https://www.toolify.ai/tool/beta" },
      { post_id: "P5", title: "First", slug: "first", post_type: "review", tool_id: "T0001" },
      { post_id: "P6", title: "Second", slug: "second", post_type: "review", source_url: "https://www.toolify.ai/tool/alpha" },
    ]));
    expect(m).toContain("a review needs a tool_id or the source_url");
    expect(m).toContain('tool_id "T9999" does not exist in Tools.tool_id');
    expect(m).toContain('source_url "https://www.toolify.ai/tool/nope" does not exist in Tools.source_url');
    expect(m).toContain("point to different tools");
    expect(m).toContain("tool T0001 already has a review (P5)");
  });

  it("requires Tools.source_url to be unique when filled", () => {
    const raw = workbook({ Tools: [
      { tool_id: "T0001", name: "A", slug: "a", source_url: "https://www.toolify.ai/tool/x" },
      { tool_id: "T0002", name: "B", slug: "b", source_url: "https://www.toolify.ai/tool/x" },
      { tool_id: "T0003", name: "C", slug: "c" },
      { tool_id: "T0004", name: "D", slug: "d" },
    ], Tool_Categories: [] });
    expect(msgs(raw)).toContain("duplicate source_url");
    expect(msgs(raw).match(/duplicate source_url/g)).toHaveLength(1);
  });

  it("keeps a Sheet without the newer Blog_Posts columns readable", () => {
    const raw = workbook({ Blog_Posts: [] });
    raw.Blog_Posts = [["post_id", "title", "slug", "excerpt", "content", "author", "published_at", "updated_at", "status", "seo_title", "seo_description"], ["P1", "Old post", "old-post", "", "", "", "", "", "published"]];
    expect(messages(raw)).toEqual([]);
  });

  it("links the post to its tool, cites the listing source, and hides it while the tool is hidden", () => {
    const raw = withTools([
      { post_id: "REV-T0001", title: "Alpha review", slug: "alpha-review", content: "Body.", post_type: "review", tool_id: "T0001", status: "published" },
      { post_id: "REV-T0002", title: "Beta review", slug: "beta-review", content: "Body.", post_type: "review", source_url: "https://www.toolify.ai/tool/beta", status: "published" },
    ]);
    const shown = parseCatalog(adaptNormalized(raw, { allowPreview: true, now: NOW }).tabs, NOW, []).catalog.posts;
    expect(shown.map((p) => p.status)).toEqual(["published", "published"]);
    expect(shown[0]!.productId).toBe("T0001");
    expect(shown[1]!.productId).toBe("T0002");
    expect(shown[0]!.body).toContain("Listing data: Source A (toolify.ai)");
    const hidden = parseCatalog(adaptNormalized(raw, { allowPreview: false, now: NOW }).tabs, NOW, []).catalog.posts;
    expect(hidden.find((p) => p.id === "REV-T0001")?.status).toBe("published");
    expect(hidden.find((p) => p.id === "REV-T0002")?.status).toBe("draft");
  });
});

describe("review text from source pages", () => {
  const html = `<main><div class="tool-hero"><div><p class="eyebrow">Coding · by Acme</p><h1>Acme Tool</h1>
  <p class="lede" style="x">Runs things &amp; checks them.</p>
  <p class="pm"><span class="plus"><b>+</b> Fast setup.</span><br><span class="minus"><b>−</b> Few integrations.</span></p>
  <div class="chips"><span class="price free">Open source</span><span class="chip">Free; paid cloud</span><span class="chip oss">open source</span><span class="chip">mac</span><span class="chip">cli</span></div>
  <p><a class="cta" href="https://acme.example.com">Open</a> <span class="chip">best for: small teams</span></p></div></div>
  <section><div class="sec-head"><h2>Evidence</h2><span>rank #4 of 257</span></div><div class="sig"><div><b>90</b><span>evidence score / 100</span></div><div><b>1,200</b><span>GitHub stars · +5 this week</span></div></div>
  <div class="chips"><a class="chip" href="/use-case/run-things/">Run things</a></div><p class="vs-links">Head to head: x</p></section></main>`;

  it("reads the facts shown on the page", async () => {
    const { parsePage } = await import("../../scripts/db/fetch-aiusecases-pages");
    const f = parsePage(html, "acme-tool", "https://aiusecases.dev/tool/acme-tool/")!;
    expect(f).toMatchObject({ name: "Acme Tool", category: "Coding", maker: "Acme", tagline: "Runs things & checks them.", plus: "Fast setup.", minus: "Few integrations.", priceLabel: "Open source", priceNote: "Free; paid cloud", platforms: ["mac", "cli"], bestFor: "small teams", rank: 4, ofTotal: 257, useCases: ["Run things"] });
    expect(f.signals).toEqual([{ value: "90", label: "evidence score / 100" }, { value: "1,200", label: "GitHub stars · +5 this week" }]);
    expect((await import("../../scripts/db/fetch-aiusecases-pages")).parsePage("<html></html>", "x", "u")).toBeNull();
  });

  it("writes only what the source shows, dates it, and says it was not tested", async () => {
    const { parsePage } = await import("../../scripts/db/fetch-aiusecases-pages");
    const { buildReview } = await import("../../scripts/db/write-reviews");
    const f = parsePage(html, "acme-tool", "https://aiusecases.dev/tool/acme-tool/")!;
    const r = buildReview(f, "https://acme.example.com");
    expect(r.content).toContain("We have not tested Acme Tool ourselves");
    expect(r.content).toContain("**Strength:** Fast setup.");
    expect(r.content).toContain("**Limit:** Few integrations.");
    expect(r.content).toContain("Listed platforms: mac, cli.");
    expect(r.content).toContain("not a quality rating or an endorsement");
    expect(r.content).toContain(`as of ${f.fetchedAt.slice(0, 10)}`);
    expect(r.excerpt.length).toBeLessThanOrEqual(160);
    expect(r.seoTitle.length).toBeLessThanOrEqual(60);
    expect(r.seoDescription.length).toBeLessThanOrEqual(160);
  });

  it("omits sections it has no facts for instead of inventing them", async () => {
    const { buildReview } = await import("../../scripts/db/write-reviews");
    const r = buildReview({ slug: "bare", url: "u", name: "Bare", category: "", maker: "", tagline: "Does one thing", plus: "", minus: "", priceLabel: "", priceNote: "", platforms: [], bestFor: "", rank: null, ofTotal: null, signals: [], useCases: [], fetchedAt: "2026-10-23T00:00:00Z" }, "");
    expect(r.content).not.toMatch(/## (Pricing|Platforms|Strengths|Public signals)/);
    expect(r.content).toContain("Does one thing.");
  });
});

describe("review text details", () => {
  it("does not mistake a platform chip for a price note", async () => {
    const { normalizeFacts } = await import("../../scripts/db/fetch-aiusecases-pages");
    const base = { slug: "s", url: "u", name: "N", category: "", maker: "", tagline: "T", plus: "", minus: "", priceLabel: "Paid", platforms: ["ios"], bestFor: "", rank: null, ofTotal: null, signals: [], useCases: [], fetchedAt: "2026-10-23T00:00:00Z" };
    expect(normalizeFacts({ ...base, priceNote: "web" })).toMatchObject({ priceNote: "", platforms: ["web", "ios"] });
    expect(normalizeFacts({ ...base, priceNote: "from $12/mo" })).toMatchObject({ priceNote: "from $12/mo", platforms: ["ios"] });
  });

  it("speaks as this site, drops empty signals", async () => {
    const { buildReview } = await import("../../scripts/db/write-reviews");
    const r = buildReview({ slug: "s", url: "u", name: "N", category: "Coding", maker: "", tagline: "T", plus: "", minus: "", priceLabel: "", priceNote: "", platforms: [], bestFor: "", rank: null, ofTotal: null, useCases: [], fetchedAt: "2026-10-23T00:00:00Z",
      signals: [{ value: "3", label: "mentions in our release feed, 30d" }, { value: "–", label: "days since last activity" }] }, "");
    expect(r.content).toContain("**3** mentions in the source's release feed, 30d");
    expect(r.content).not.toContain("days since last activity");
    expect(r.content).not.toMatch(/\bour release feed\b/);
  });
});

describe("source citation", () => {
  it("does not repeat the host when the source name already contains it", () => {
    const raw = workbook({
      Tools: [{ tool_id: "T0001", name: "A", slug: "a", source_url: "https://aiusecases.dev/tool/a/", source_name: "AI Use Cases (aiusecases.dev, CC BY 4.0)", publish_status: "published" }],
      Tool_Categories: [],
      Blog_Posts: [{ post_id: "REV-T0001", title: "A review", slug: "a-review", content: "Body.", post_type: "review", tool_id: "T0001", status: "published" }],
    });
    const body = parseCatalog(adaptNormalized(raw, { allowPreview: true, now: NOW }).tabs, NOW, []).catalog.posts[0]!.body;
    expect(body).toContain("Listing data: AI Use Cases (aiusecases.dev, CC BY 4.0).");
    expect(body).not.toContain("(aiusecases.dev) (");
  });
});

describe("deal logos follow the deal's tool_id", () => {
  const tools = (logo: string) => [
    { tool_id: "T0001", name: "Sample Writer", slug: "sample-writer", short_description: "Fictional writing tool.", logo_url: logo, affiliate_url: "https://writer-tool.io/", publish_status: "published", data_source_type: "manually_entered", verification_status: "verified", updated_at: "2026-10-01" },
    { tool_id: "T0002", name: "Sample Painter", slug: "sample-painter", short_description: "Fictional image tool.", logo_url: "https://cdn.painter-tool.io/other.png", affiliate_url: "https://painter-tool.io/", publish_status: "published", data_source_type: "manually_entered", verification_status: "verified", updated_at: "2026-10-01" },
  ];
  const deals = [{ deal_id: "D1", tool_id: "T0001", publish_status: "published", title: "Writer annual", coupon_code: "SAVE", discount: "20% off", expires_at: "2026-12-01", verification_status: "verified", updated_at: "2026-10-20" }];
  const logoOfDeal = (logo: string) => {
    const { catalog } = parseCatalog(adaptNormalized(workbook({ Tools: tools(logo), Deals: deals }), { allowPreview: true, now: NOW }).tabs, NOW, []);
    const coupon = catalog.coupons.find((c) => c.id === "D1")!;
    return catalog.brands.find((b) => b.id === coupon.brandId)!.logoUrl;
  };

  it("uses Tools.logo_url of the deal's own tool, never another tool's", () => {
    expect(logoOfDeal("https://cdn.writer-tool.io/logo.png")).toBe("https://cdn.writer-tool.io/logo.png");
  });

  it("falls back to the tool's website logo when Tools.logo_url is empty", () => {
    expect(logoOfDeal("")).toBe("/logo/T0001/");
  });
});
