import { describe, expect, it } from "vitest";
import { adaptNormalized, emptyNormalized } from "@/data/normalized/adapt";
import { HEADERS } from "@/data/normalized/schema";
import { parseCatalog } from "@/data/schemas/parse";
import { selectFeatured } from "@/lib/featured";
import { buildMarket } from "@/lib/market";
import type { DealView } from "@/types/catalog";

const NOW = new Date("2026-10-26T12:00:00Z");
const row = (tab: keyof typeof HEADERS, v: Record<string, string>) => HEADERS[tab].map((h) => v[h] ?? "");

/** The live Sheet's shape: real preview tools, one fictional tool on example.com with sample deals. */
function catalog(allowPreview: boolean) {
  const raw = emptyNormalized();
  raw.Tools = [
    [...HEADERS.Tools],
    row("Tools", { tool_id: "T1", name: "Realtool", slug: "realtool", official_url: "https://realtool.com", publish_status: "preview", data_source_type: "preview_import" }),
    row("Tools", { tool_id: "T9", name: "Quillnest", slug: "quillnest", official_url: "https://quillnest.example.com", publish_status: "preview", data_source_type: "preview_import", source_name: "Fictional sample" }),
  ];
  raw.Deals = [
    [...HEADERS.Deals],
    row("Deals", { deal_id: "S1", tool_id: "T9", title: "Quillnest annual", coupon_code: "SAMPLE30", discount: "30% off", expires_at: "2026-11-01", verification_status: "verified", publish_status: "preview", updated_at: "2026-10-21", is_featured: "TRUE", featured_order: "1" }),
    row("Deals", { deal_id: "S2", tool_id: "T1", coupon_code: "REALPREVIEW", discount: "10% off", verification_status: "verified", publish_status: "preview", updated_at: "2026-10-21", is_featured: "TRUE" }),
    row("Deals", { deal_id: "S3", tool_id: "T9", coupon_code: "SAMPLEWELL", discount: "30 extra days", verification_status: "unverified", publish_status: "preview" }),
  ];
  const { tabs } = adaptNormalized(raw, { allowPreview, now: NOW });
  return parseCatalog(tabs, NOW).catalog;
}

describe("sample data never reaches the Deals page", () => {
  it("lists no sample deal and no fictional brand, even where preview records are shown", () => {
    for (const allowPreview of [true, false]) {
      const m = buildMarket(catalog(allowPreview), NOW);
      expect(m.coupons).toEqual([]);
      expect(m.categories).toEqual([]);
      expect(JSON.stringify(m)).not.toMatch(/sample/i);
    }
  });

  it("never features a sample deal", () => {
    const c = catalog(true);
    const brands = new Map(c.brands.map((b) => [b.id, b]));
    const views: DealView[] = c.coupons.map((x) => ({ ...x, brand: brands.get(x.brandId)!, active: true }));
    expect(views.length).toBeGreaterThan(0);
    expect(selectFeatured(views, { limit: 8 }, NOW)).toEqual([]);
  });
});
