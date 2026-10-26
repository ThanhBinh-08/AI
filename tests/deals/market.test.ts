import { describe, expect, it } from "vitest";
import {
  buildMarket,
  filterCoupons,
  isFiltered,
  marketQuery,
  parseMarketState,
  queryTerms,
  sortCoupons,
  type Market,
} from "@/lib/market";
import { isCouponFreeRoute, isEligibleCoupon, isLiveCoupon } from "@/lib/coupon-rules";
import type { Brand, Catalog, Coupon, Product } from "@/types/catalog";

const NOW = new Date("2026-10-26T12:00:00Z");

function brand(id: string, over: Partial<Brand> = {}): Brand {
  return {
    id,
    name: id[0]!.toUpperCase() + id.slice(1),
    slug: id,
    logoUrl: null,
    description: `${id} description`,
    categories: ["ai-writing"],
    domain: `${id}.com`,
    status: "published",
    programStatus: "pending",
    hasAffiliate: false,
    updatedAt: null,
    ...over,
  };
}

function coupon(id: string, brandId: string, over: Partial<Coupon> = {}): Coupon {
  return {
    id,
    slug: `${brandId}-${id.toLowerCase()}`,
    brandId,
    code: `CODE${id}`,
    discount: "20% off",
    title: `${id} title`,
    terms: "",
    expiresAt: "2026-12-31",
    sourceHost: null,
    verification: "source_verified",
    verifiedAt: "2026-10-20",
    status: "published",
    ...over,
  };
}

function product(id: string, brandId: string, name: string): Product {
  return {
    id, brandId, name, slug: id, description: "", imageUrl: null, categories: [], pricing: "", pricingCheckedAt: null, pricingSourceHost: null,
    features: [], useCases: [], pros: [], cons: [], status: "published", platforms: [], verified: false, verifiedAt: null, listingSource: null, officialUrl: null,
  };
}

const catalog: Catalog = {
  brands: [
    brand("alpha", { categories: ["ai-writing", "productivity"], hasAffiliate: true, programStatus: "approved" }),
    brand("beta", { categories: ["ai-video"] }),
    brand("gamma", { categories: [] }), // no category, no coupon
    brand("draft", { status: "draft" }),
    brand("fiction", { sample: true, preview: true }),
  ],
  coupons: [
    coupon("A1", "alpha", { verification: "checkout_tested", verifiedAt: "2026-10-10", expiresAt: "2026-11-01", terms: "Annual plans only." }),
    coupon("A2", "alpha", { code: null, discount: "First month free", verifiedAt: "2026-10-22", expiresAt: null }),
    coupon("A3", "alpha", { expiresAt: "2026-10-25" }), // expired yesterday
    coupon("A4", "alpha", { expiresAt: "2026-10-26", verifiedAt: "2026-10-01" }), // last day today: still live
    coupon("A5", "alpha", { verification: "unverified", verifiedAt: null }), // has a code, never checked
    coupon("A6", "alpha", { status: "draft" }),
    coupon("A7", "alpha", { discount: "  " }), // no discount
    coupon("B1", "beta", { code: "BETA10", discount: "$10 off", expiresAt: "2026-11-20" }),
    coupon("D1", "draft"), // brand not published
    coupon("F1", "fiction"), // fictional brand
    coupon("X1", "ghost"), // orphan
  ],
  products: [product("alpha-app", "alpha", "Alpha Writer"), product("beta-app", "beta", "Beta Studio")],
  posts: [],
  issues: [],
};

const market = buildMarket(catalog, NOW);

describe("coupon rules", () => {
  it("treats the end date as inclusive and a missing end date as open", () => {
    expect(isLiveCoupon({ status: "published", expiresAt: "2026-10-26" }, NOW)).toBe(true);
    expect(isLiveCoupon({ status: "published", expiresAt: "2026-10-25" }, NOW)).toBe(false);
    expect(isLiveCoupon({ status: "published", expiresAt: null }, NOW)).toBe(true);
    expect(isLiveCoupon({ status: "draft", expiresAt: null }, NOW)).toBe(false);
  });

  it("never treats a code as verified just because it exists", () => {
    const c = coupon("Z", "alpha", { verification: "unverified", verifiedAt: null });
    expect(isEligibleCoupon(c, { status: "published" }, NOW)).toBe(false);
    expect(isEligibleCoupon({ ...c, verification: "source_verified" }, { status: "published" }, NOW)).toBe(true);
    expect(isEligibleCoupon({ ...c, verification: "source_verified" }, undefined, NOW)).toBe(false);
    expect(isEligibleCoupon({ ...c, verification: "source_verified" }, { status: "draft" }, NOW)).toBe(false);
  });

  it("marks every Blog route as coupon-free", () => {
    expect(isCouponFreeRoute("/blog/")).toBe(true);
    expect(isCouponFreeRoute("/blog")).toBe(true);
    expect(isCouponFreeRoute("/blog/some-post/")).toBe(true);
    for (const p of ["/deals/", "/tools/x/", "/brands/x/", "/categories/ai-video/", "/search/", "/compare/a-vs-b/", "/blogger/", null]) {
      expect(isCouponFreeRoute(p)).toBe(false);
    }
  });
});

describe("market data", () => {
  it("keeps only eligible coupons", () => {
    expect(market.coupons.map((k) => k.slug).sort()).toEqual(["alpha-a1", "alpha-a2", "alpha-a4", "beta-b1"]);
  });

  it("renders codes, discounts, terms and end dates exactly as stored", () => {
    const a1 = market.coupons.find((k) => k.slug === "alpha-a1")!;
    expect(a1).toMatchObject({ code: "CODEA1", discount: "20% off", terms: "Annual plans only.", expiresAt: "2026-11-01", brandName: "Alpha", verification: "checkout_tested" });
    expect(market.coupons.find((k) => k.slug === "alpha-a2")?.code).toBeNull();
  });

  it("ties every coupon to its own brand", () => {
    for (const k of market.coupons) expect(catalog.coupons.find((c) => c.slug === k.slug)?.brandId).toBe(k.brandSlug);
  });

  it("lists only categories that have eligible coupons, with the count (no empty category blocks)", () => {
    expect(market.categories.map((c) => [c.slug, c.coupons])).toEqual([
      ["ai-writing", 3],
      ["ai-video", 1],
      ["productivity", 3],
    ]);
  });

  it("links CTAs only through /go/ and only for brands with an approved affiliate link", () => {
    expect(market.coupons.find((k) => k.slug === "beta-b1")?.goHref).toBeNull();
    for (const k of market.coupons.filter((k) => k.brandSlug === "alpha")) expect(k.goHref).toMatch(/^\/go\/alpha\/\?o=/);
  });

  it("never carries an official URL or domain as a destination", () => {
    const json = JSON.stringify(market);
    expect(json).not.toContain("alpha.com");
    expect(json).not.toContain("http");
  });
});

describe("search", () => {
  it("normalizes input: case, accents, punctuation, length and term count", () => {
    expect(queryTerms("  Ünïcode   VIDEO!! ")).toEqual(["unicode", "video"]);
    expect(queryTerms("50% $10")).toEqual(["50%", "$10"]);
    expect(queryTerms("a b c d e f g h i j")).toHaveLength(8);
    expect(queryTerms("x".repeat(500))[0]).toHaveLength(80);
    expect(queryTerms("<script>")).toEqual(["script"]);
  });

  it("finds coupons by code, discount, brand and category", () => {
    expect(filterCoupons(market.coupons, { q: "beta10" }).map((k) => k.slug)).toEqual(["beta-b1"]);
    expect(filterCoupons(market.coupons, { q: "$10" }).map((k) => k.slug)).toEqual(["beta-b1"]);
    expect(filterCoupons(market.coupons, { q: "month free" }).map((k) => k.slug)).toEqual(["alpha-a2"]);
    expect(filterCoupons(market.coupons, { q: "productivity" }).every((k) => k.brandSlug === "alpha")).toBe(true);
    expect(filterCoupons(market.coupons, { q: "nothing-like-this" })).toEqual([]);
  });
});

describe("filters and sorting", () => {
  it("filters coupons by category, brand and check", () => {
    expect(filterCoupons(market.coupons, { category: "ai-video" }).map((k) => k.slug)).toEqual(["beta-b1"]);
    expect(filterCoupons(market.coupons, { brand: "alpha" })).toHaveLength(3);
    expect(filterCoupons(market.coupons, { check: "checkout_tested" }).map((k) => k.slug)).toEqual(["alpha-a1"]);
  });

  it("sorts by recent check, end date (undated last) and brand", () => {
    expect(sortCoupons(market.coupons, "verified").map((k) => k.slug)).toEqual(["alpha-a2", "beta-b1", "alpha-a1", "alpha-a4"]);
    expect(sortCoupons(market.coupons, "ending").map((k) => k.slug)).toEqual(["alpha-a4", "alpha-a1", "beta-b1", "alpha-a2"]);
    expect(sortCoupons(market.coupons, "brand").map((k) => k.brandSlug)).toEqual(["alpha", "alpha", "alpha", "beta"]);
  });

  it("knows when a view is filtered (sorting alone is not a filter)", () => {
    expect(isFiltered({})).toBe(false);
    expect(isFiltered({ sort: "ending" })).toBe(false);
    expect(isFiltered({ q: "  " })).toBe(false);
    expect(isFiltered({ q: "x" })).toBe(true);
    expect(isFiltered({ category: "ai-video" })).toBe(true);
    expect(isFiltered({ check: "checkout_tested" })).toBe(true);
  });
});

describe("URL state", () => {
  const get = (q: string) => {
    const sp = new URLSearchParams(q);
    return (k: string) => sp.get(k) ?? "";
  };

  it("drops unknown or malformed values", () => {
    const st = parseMarketState(get("view=evil&category=nope&brand=../x&check=hacked&status=<b>&sort=drop"), market);
    expect(st).toEqual({ q: "", category: undefined, brand: undefined, check: undefined, sort: "verified" });
  });

  it("only accepts a brand that has a listed coupon, and a category that has coupons", () => {
    expect(parseMarketState(get("brand=gamma&category=marketing"), market)).toMatchObject({ brand: undefined, category: undefined });
    expect(parseMarketState(get("brand=beta&category=ai-video"), market)).toMatchObject({ brand: "beta", category: "ai-video" });
  });

  it("reads valid values and writes them back without defaults", () => {
    const st = parseMarketState(get("q=writer&category=ai-writing&brand=alpha&check=checkout_tested&sort=ending"), market);
    expect(st).toMatchObject({ q: "writer", category: "ai-writing", brand: "alpha", check: "checkout_tested", sort: "ending" });
    expect(marketQuery(st)).toBe("?q=writer&category=ai-writing&brand=alpha&check=checkout_tested&sort=ending");
    expect(marketQuery(parseMarketState(get(""), market))).toBe("");
  });

  it("keeps an empty list empty: no category chips and nothing to filter", () => {
    const empty: Market = buildMarket({ ...catalog, coupons: [] }, NOW);
    expect(empty).toEqual({ coupons: [], categories: [] });
  });
});
