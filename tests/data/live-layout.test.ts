import { describe, expect, it, vi } from "vitest";
import { adaptNormalized, emptyNormalized, toolLink } from "@/data/normalized/adapt";
import { parseCatalog } from "@/data/schemas/parse";
import { NormalizedGoogleSource } from "@/data/sheets/normalized-source";
import { buildMarket } from "@/lib/market";

/*
 * The live Sheet since 2026-10-26: Tool_Alternatives and Import_Log removed; Tools without official_url (its URLs moved
 * to affiliate_url), description, created_at, updated_at; Deals reduced to six columns plus is_featured/featured_order.
 */
const NOW = new Date("2026-10-26T12:00:00Z");

const TOOLS_HEADER = [
  "tool_id", "name", "slug", "short_description", "logo_url", "affiliate_url", "pricing_model", "pricing_details", "launch_date",
  "source_name", "source_url", "imported_at", "data_source_type", "verification_status", "publish_status", "featured", "display_order",
];
const DEALS_HEADER = ["deal_id", "tool_id", "title", "coupon_code", "discount", "expires_at", "is_featured", "featured_order"];

function tool(id: string, name: string, url: string, over: Record<string, string> = {}): string[] {
  const v: Record<string, string> = {
    tool_id: id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), short_description: `${name} does things.`, affiliate_url: url,
    publish_status: "published", data_source_type: "manually_entered", verification_status: "unverified", featured: "FALSE", ...over,
  };
  return TOOLS_HEADER.map((h) => v[h] ?? "");
}

function liveSheet(tools: string[][], deals: string[][] = []) {
  const raw = emptyNormalized();
  raw.Settings = [["setting_key", "setting_value", "description", "updated_at"]];
  raw.Categories = [
    ["category_id", "category_name", "slug", "description", "parent_category_id", "display_order", "status", "created_at", "updated_at"],
    ["CAT001", "AI Writing", "ai-writing", "", "", "1", "active", "", ""],
  ];
  raw.Tools = [TOOLS_HEADER, ...tools];
  raw.Tool_Categories = [["tool_category_id", "tool_id", "category_id", "is_primary", "created_at"]];
  raw.Deals = [DEALS_HEADER, ...deals];
  raw.Blog_Posts = [["post_id", "title", "slug", "excerpt", "content", "author", "published_at", "updated_at", "status", "seo_title", "seo_description", "source_url", "post_type", "tool_id"]];
  // Tool_Alternatives and Import_Log stay empty: the tabs are gone.
  return raw;
}

describe("the live Sheet layout", () => {
  it("is read without missing-column or missing-tab problems", () => {
    const { issues } = adaptNormalized(liveSheet([tool("T1", "Alpha", "https://alpha.ai")]), { allowPreview: false, now: NOW });
    expect(issues.filter((i) => /missing column/.test(i.message))).toEqual([]);
  });

  it("links every tool to the URL in its own row, matched by tool_id, whatever the row order", () => {
    const rows = [
      tool("T3", "Gamma", "https://www.gamma.app/start"),
      tool("T1", "Alpha", "https://alpha.ai"),
      tool("T2", "Beta", "https://beta.io/pricing?ref=me"),
    ];
    const { tabs } = adaptNormalized(liveSheet(rows), { allowPreview: false, now: NOW });
    const { affiliateUrls, catalog } = parseCatalog(tabs, NOW, []);
    expect(affiliateUrls.get("T1")).toBe("https://alpha.ai/");
    expect(affiliateUrls.get("T2")).toBe("https://beta.io/pricing?ref=me");
    expect(affiliateUrls.get("T3")).toBe("https://www.gamma.app/start");
    expect(catalog.brands.every((b) => b.hasAffiliate)).toBe(true);
    // The tool page shows the host of the same URL (and links to it through /go/<tool_id>/).
    expect(catalog.products.find((p) => p.id === "T2")?.officialUrl).toBe("https://beta.io/pricing?ref=me");
  });

  it("gives no link to a tool with an empty, non-https or fictional URL", () => {
    const { tabs, issues } = adaptNormalized(
      liveSheet([tool("T1", "Empty", ""), tool("T2", "Plain", "http://plain.io"), tool("T3", "Fiction", "https://fiction.example.com", { source_name: "Fictional sample" })]),
      { allowPreview: false, now: NOW },
    );
    const { affiliateUrls } = parseCatalog(tabs, NOW, []);
    expect(affiliateUrls.size).toBe(0);
    expect(issues.some((i) => /affiliate_url is not a public https URL/.test(i.message))).toBe(true);
  });

  it("links a UI-test row on an example domain once it is no longer marked fictional", () => {
    const { tabs } = adaptNormalized(liveSheet([tool("T0258", "Quillnest", "https://www.quillnest.example.com", { source_name: "UI test data (replace)" })]), { allowPreview: false, now: NOW });
    const { affiliateUrls, catalog } = parseCatalog(tabs, NOW, []);
    expect(affiliateUrls.get("T0258")).toBe("https://www.quillnest.example.com/");
    expect(catalog.brands[0]).toMatchObject({ hasAffiliate: true, status: "published" });
    expect(catalog.brands[0]?.sample).toBeUndefined();
  });

  it("prefers affiliate_url over a leftover official_url column, and falls back to official_url on older Sheets", () => {
    expect(toolLink({ affiliate_url: "https://a.io/?ref=1", official_url: "https://a.io" })).toBe("https://a.io/?ref=1");
    expect(toolLink({ affiliate_url: "", official_url: "https://a.io" })).toBe("https://a.io");
    expect(toolLink({ affiliate_url: "  ", official_url: undefined })).toBe("");
  });

  it("publishes a deal with its tool when the Deals tab has no publish_status column, and never calls it checked", () => {
    const { tabs } = adaptNormalized(
      liveSheet([tool("T1", "Alpha", "https://alpha.ai"), tool("T2", "Hidden", "https://hidden.ai", { publish_status: "draft" })], [
        ["D1", "T1", "Alpha yearly", "ALPHA20", "20% off", "2026-12-31", "TRUE", "2"],
        ["D2", "T2", "Hidden deal", "HID", "10% off", "", "", ""],
      ]),
      { allowPreview: false, now: NOW },
    );
    const { catalog } = parseCatalog(tabs, NOW, []);
    const d1 = catalog.coupons.find((c) => c.id === "D1");
    expect(d1).toMatchObject({ status: "published", code: "ALPHA20", verification: "unverified", featured: true, featuredOrder: 2 });
    expect(catalog.coupons.find((c) => c.id === "D2")).toBeUndefined(); // its tool is a draft
    // No verification column: nothing is promoted as a checked deal.
    expect(buildMarket(catalog, NOW).coupons).toEqual([]);
  });
});

describe("reading the live Sheet from Google", () => {
  const env = { GOOGLE_SHEET_ID: "sheet", GOOGLE_SERVICE_ACCOUNT_EMAIL: "x@y.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: "k" };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  it("asks only for the tabs that exist and accepts the removed optional ones", async () => {
    const titles = ["Settings", "Categories", "Tools", "Tool_Categories", "Deals", "Blog_Posts"];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("fields=sheets.properties.title")) return json({ sheets: titles.map((title) => ({ properties: { title } })) });
      const asked = [...new URL(url).searchParams.getAll("ranges")];
      expect(asked).toEqual(titles.map((t) => `'${t}'`));
      return json({ valueRanges: asked.map((r) => (r === "'Tools'" ? { values: [TOOLS_HEADER, tool("T1", "Alpha", "https://alpha.ai")] } : { values: [] })) });
    });
    const src = new NormalizedGoogleSource(env, fetchImpl as unknown as typeof fetch, async () => "token", 1000, async () => {});
    const tabs = await src.fetchTabs();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tabs.Brands[1]?.[0]).toBe("T1");
  });

  it("fails clearly when a required tab is missing", async () => {
    const fetchImpl = vi.fn(async () => json({ sheets: [{ properties: { title: "Tools" } }] }));
    const src = new NormalizedGoogleSource(env, fetchImpl as unknown as typeof fetch, async () => "token", 1000, async () => {});
    await expect(src.fetchTabs()).rejects.toThrow(/missing required tab\(s\): Settings, Categories, Tool_Categories, Deals, Blog_Posts/);
  });
});
