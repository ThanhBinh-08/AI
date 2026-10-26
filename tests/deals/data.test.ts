import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adaptNormalized, emptyNormalized } from "@/data/normalized/adapt";
import { CATEGORY_SEED, HEADERS } from "@/data/normalized/schema";
import { CATEGORIES } from "@/config/categories";
import { getDealsMarket, listDeals } from "@/data/repository";
import { parseCatalog } from "@/data/schemas/parse";
import { buildMarket } from "@/lib/market";
import { FixtureSource } from "@/data/sheets/fixture-source";
import { type RawTabs, type SheetSource } from "@/data/sheets/source";
import { resetStore } from "@/data/store";

/** A source that counts reads and can be told to fail. */
class CountingSource implements SheetSource {
  readonly kind = "fixture" as const;
  calls = 0;
  fail = false;
  constructor(private readonly inner: SheetSource) {}
  async fetchTabs(): Promise<RawTabs> {
    this.calls++;
    if (this.fail) throw new Error("Sheets down");
    return this.inner.fetchTabs();
  }
}

beforeEach(() => vi.stubEnv("AFFILIATE_EXTRA_HOSTS", ""));
afterEach(() => vi.unstubAllEnvs());

describe("Deals market from the fixture catalog", () => {
  beforeEach(() => resetStore(new FixtureSource()));

  it("agrees with the shared deal list: same eligible coupons", async () => {
    const m = await getDealsMarket();
    const listed = (await listDeals()).items.map((d) => d.slug).sort();
    expect(m.coupons.map((k) => k.slug).sort()).toEqual(listed);
    expect(m.coupons.length).toBeGreaterThan(0);
  });

  it("links every deal only through the /go/ redirect", async () => {
    const m = await getDealsMarket();
    expect(m.coupons.every((k) => k.goHref === null || k.goHref.startsWith("/go/"))).toBe(true);
  });
});

describe("caching and failures", () => {
  it("serves search, filters and repeat visits from one read of the source", async () => {
    const src = new CountingSource(new FixtureSource());
    resetStore(src);
    await getDealsMarket();
    await getDealsMarket();
    await listDeals({ category: "ai-writing" });
    expect(src.calls).toBe(1);
  });

  it("keeps serving the last good data when a refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const src = new CountingSource(new FixtureSource());
    resetStore(src);
    const first = await getDealsMarket();
    src.fail = true;
    vi.setSystemTime(Date.now() + 10 * 60_000); // past the cache TTL
    const again = await getDealsMarket();
    expect(src.calls).toBe(2);
    expect(again.coupons.map((k) => k.slug)).toEqual(first.coupons.map((k) => k.slug));
    vi.useRealTimers();
  });

  it("raises an 'unavailable' error (for the error page) when there is no data at all", async () => {
    const src = new CountingSource(new FixtureSource());
    src.fail = true;
    resetStore(src);
    await expect(getDealsMarket()).rejects.toMatchObject({ name: expect.stringMatching(/Unavailable/) });
  });
});

describe("Google Sheets mapping (normalized layout)", () => {
  const row = (tab: keyof typeof HEADERS, v: Record<string, string>) => HEADERS[tab].map((h) => v[h] ?? "");

  function sheet(deals: Record<string, string>[], tools: Record<string, string>[] = []) {
    const raw = emptyNormalized();
    raw.Categories = [[...HEADERS.Categories], row("Categories", { category_id: "CAT001", category_name: "AI Writing", slug: "ai-writing", status: "active" })];
    raw.Tools = [
      [...HEADERS.Tools],
      row("Tools", { tool_id: "T1", name: "Alpha", slug: "alpha", official_url: "https://alpha.com", affiliate_url: "https://alpha.com/?ref=site", publish_status: "published", data_source_type: "manually_entered", verification_status: "verified" }),
      row("Tools", { tool_id: "T2", name: "Beta", slug: "beta", official_url: "https://beta.com", publish_status: "published", data_source_type: "manually_entered" }),
      ...tools.map((t) => row("Tools", t)),
    ];
    raw.Tool_Categories = [[...HEADERS.Tool_Categories], row("Tool_Categories", { tool_category_id: "TC1", tool_id: "T1", category_id: "CAT001", is_primary: "TRUE" })];
    raw.Deals = [[...HEADERS.Deals], ...deals.map((d) => row("Deals", d))];
    const { tabs, issues } = adaptNormalized(raw, { allowPreview: false, now: new Date("2026-10-26T00:00:00Z") });
    const catalog = parseCatalog(tabs).catalog;
    return { market: buildMarket(catalog, new Date("2026-10-26T12:00:00Z")), catalog, issues };
  }

  it("maps a verified, published, unexpired deal to an eligible coupon with the tool's own affiliate link", () => {
    const { market, catalog } = sheet([
      { deal_id: "D1", tool_id: "T1", title: "Alpha yearly", coupon_code: "ALPHA20", discount: "20% off", expires_at: "2026-12-31", verification_status: "verified", publish_status: "published", updated_at: "2026-10-20" },
    ]);
    expect(market.coupons).toHaveLength(1);
    expect(market.coupons[0]).toMatchObject({ code: "ALPHA20", discount: "20% off", expiresAt: "2026-12-31", brandSlug: "alpha" });
    expect(market.coupons[0]!.goHref).toMatch(/^\/go\/T1\//);
    // Beta has no affiliate_url: its official_url (same Tools row) is its link.
    expect(catalog.brands.find((b) => b.slug === "beta")?.hasAffiliate).toBe(true);
  });

  it("drops unverified, preview, expired and orphaned deals, and ignores a deal-level affiliate_url", () => {
    const { market, issues } = sheet([
      { deal_id: "D2", tool_id: "T1", coupon_code: "NOPE", discount: "10% off", verification_status: "unverified", publish_status: "published" },
      { deal_id: "D3", tool_id: "T1", coupon_code: "SAMPLE", discount: "10% off", verification_status: "verified", publish_status: "preview" },
      { deal_id: "D4", tool_id: "T1", coupon_code: "OLD", discount: "10% off", verification_status: "verified", publish_status: "published", expires_at: "2026-10-01" },
      { deal_id: "D5", tool_id: "T9", coupon_code: "GHOST", discount: "10% off", verification_status: "verified", publish_status: "published" },
      { deal_id: "D6", tool_id: "T2", coupon_code: "B5", discount: "5% off", verification_status: "verified", publish_status: "published", updated_at: "2026-10-20", affiliate_url: "https://beta.com/?ref=x" },
    ]);
    expect(market.coupons.map((k) => k.code)).toEqual(["B5"]);
    // The deal row's own affiliate_url is ignored: the link is Beta's Tools row (official_url), by tool_id.
    expect(market.coupons[0]!.goHref).toMatch(/^\/go\/T2\/\?o=D6/);
    expect(issues.some((i) => /does not exist/.test(i.message))).toBe(true);
    expect(issues.some((i) => /deal affiliate_url is ignored/.test(i.message))).toBe(true);
  });

  it("hides preview tools from an indexable site and never lists fictional ones", () => {
    const { catalog } = sheet([], [
      { tool_id: "T3", name: "Preview", slug: "preview", publish_status: "preview", data_source_type: "preview_import" },
      { tool_id: "T4", name: "Fiction", slug: "fiction", official_url: "https://fiction.example.com", source_name: "Fictional sample", publish_status: "published", data_source_type: "manually_entered" },
    ]);
    expect(catalog.brands.filter((b) => b.status === "published" && !b.sample).map((b) => b.slug)).toEqual(["alpha", "beta"]);
  });

  it("rejects a Deals tab with a missing column instead of guessing", () => {
    const raw = emptyNormalized();
    raw.Tools = [[...HEADERS.Tools]];
    raw.Deals = [["deal_id", "tool_id", "discount"], ["D1", "T1", "10% off"]];
    const { tabs, issues } = adaptNormalized(raw, { allowPreview: false });
    expect(issues.some((i) => i.tab === "Deals" && /missing column/.test(i.message))).toBe(true);
    expect(tabs.Coupons).toHaveLength(1); // header only
  });

  it("uses the same ten categories as the Sheet's Categories tab seed", () => {
    expect(CATEGORIES.map((c) => [c.slug, c.name])).toEqual(CATEGORY_SEED.map((c) => [c.slug, c.name]));
    expect(CATEGORIES).toHaveLength(10);
  });
});


describe("a check needs a date", () => {
  it("treats a 'verified' deal without updated_at as unchecked", () => {
    const raw = emptyNormalized();
    const row = (tab: keyof typeof HEADERS, v: Record<string, string>) => HEADERS[tab].map((h) => v[h] ?? "");
    raw.Tools = [[...HEADERS.Tools], row("Tools", { tool_id: "T1", name: "Alpha", slug: "alpha", publish_status: "published", data_source_type: "manually_entered" })];
    raw.Deals = [[...HEADERS.Deals], row("Deals", { deal_id: "D1", tool_id: "T1", coupon_code: "X", discount: "10% off", verification_status: "verified", publish_status: "published" })];
    const { tabs } = adaptNormalized(raw, { allowPreview: false });
    expect(buildMarket(parseCatalog(tabs).catalog).coupons).toEqual([]);
  });
});
