import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAlternatives,
  getBrand,
  getCategory,
  getComparison,
  getDeal,
  getHome,
  getTool,
  listCategories,
  listDeals,
  listPosts,
  resolveGo,
  search,
  sitemapData,
} from "@/data/repository";
import { FixtureSource } from "@/data/sheets/fixture-source";
import { resetStore } from "@/data/store";

beforeEach(() => {
  vi.stubEnv("AFFILIATE_EXTRA_HOSTS", "");
  resetStore(new FixtureSource());
});

describe("deals", () => {
  it("lists only active, checked deals of published brands", async () => {
    const { items, total } = await listDeals();
    const ids = items.map((d) => d.id).sort();
    // C1, F1, P1 are unchecked; F2 claims checkout_tested without a date, so it counts as unchecked too.
    expect(ids).toEqual(["Q1", "Q2"]);
    expect(total).toBe(2);
    expect(items.every((d) => d.active)).toBe(true);
  });

  it("puts checked deals first by default", async () => {
    const { items } = await listDeals();
    expect(items[0]?.id).toBe("Q1"); // tested at checkout
    expect(items[1]?.id).toBe("Q2"); // source checked
  });

  it("filters by category, brand and status", async () => {
    expect((await listDeals({ category: "ai-writing" })).items.map((d) => d.id).sort()).toEqual(["Q1", "Q2"]);
    expect((await listDeals({ category: "ai-video" })).items).toEqual([]); // only unchecked Framecast deals
    expect((await listDeals({ brand: "quillwise-sample" })).items.map((d) => d.id).sort()).toEqual(["Q1", "Q2"]);
    expect((await listDeals({ verification: "checkout_tested" })).items.map((d) => d.id)).toEqual(["Q1"]);
  });

  it("keeps an expired deal page, marked inactive", async () => {
    const page = await getDeal("quillwise-sample-q3");
    expect(page?.deal.active).toBe(false);
  });

  it("404s drafts, unknown slugs and deals of unpublished brands", async () => {
    expect(await getDeal("quillwise-sample-q4")).toBeNull();
    expect(await getDeal("nope")).toBeNull();
    expect(await getDeal("draft-brand-sample-d1")).toBeNull();
  });
});

describe("affiliate URLs", () => {
  it("resolves every deal of one brand to the same approved URL", async () => {
    const { items } = await listDeals({ brand: "quillwise-sample" });
    const urls = await Promise.all(items.map((d) => resolveGo(d.brandId)));
    expect(new Set(urls).size).toBe(1);
    expect(urls[0]).toBe("https://quillwise.sjv.io/c/1/2/3");
  });

  it("returns nothing for pending programs, drafts, http links, disallowed hosts and unknown ids", async () => {
    for (const id of ["codely", "draftco", "insecure", "offlist", "ghost", ""]) expect(await resolveGo(id)).toBeNull();
  });
});

describe("pages", () => {
  it("brand page splits active and ended deals", async () => {
    const b = await getBrand("quillwise-sample");
    expect(b?.deals.map((d) => d.id).sort()).toEqual(["Q1", "Q2"]);
    expect(b?.expired.map((d) => d.id)).toEqual(["Q3"]);
    expect(await getBrand("draft-brand-sample")).toBeNull();
  });

  it("tool page needs a published tool of a published brand", async () => {
    expect((await getTool("quillwise-writer"))?.tool.name).toBe("Quillwise Writer (sample)");
    expect(await getTool("draft-app")).toBeNull();
  });

  it("category pages exist only with content", async () => {
    expect(await getCategory("ai-writing")).not.toBeNull();
    expect(await getCategory("design")).toBeNull(); // only a draft brand
    expect(await getCategory("not-a-category")).toBeNull();
    expect((await listCategories()).some((c) => c.slug === "design")).toBe(false);
  });

  it("comparisons need two public tools; alternatives a public subject", async () => {
    expect((await getComparison("quillwise-vs-framecast"))?.tools).toHaveLength(2);
    expect(await getComparison("one-tool-only")).toBeNull();
    const alt = await getAlternatives("quillwise-writer-alternatives");
    expect(alt?.subject.id).toBe("quill-app");
    expect(alt?.alternatives.map((t) => t.id)).toEqual(["frame-app", "codely-app"]);
  });

  it("merges Sheet posts with the built-in guides and hides drafts", async () => {
    const posts = await listPosts();
    expect(posts.some((p) => p.slug === "sample-sheet-post")).toBe(true);
    expect(posts.some((p) => p.slug === "how-to-check-a-software-coupon-code")).toBe(true);
    expect(posts.some((p) => p.slug === "draft-post")).toBe(false);
  });

  it("home stats are counts from the data", async () => {
    const home = await getHome();
    expect(home.stats).toEqual({ deals: 2, brands: 5, tools: 3, categories: home.categories.length });
  });
});

describe("search", () => {
  it("finds deals, tools and brands", async () => {
    const r = await search("quillwise");
    expect(r.deals.length).toBeGreaterThan(0);
    expect(r.tools.map((t) => t.id)).toContain("quill-app");
    expect(r.brands.map((b) => b.id)).toContain("quill");
  });

  it("returns nothing for an empty query and caps long ones", async () => {
    expect((await search("   ")).total).toBe(0);
    expect((await search("x".repeat(500))).query.length).toBe(80);
  });
});

describe("sitemap data", () => {
  it("leaves out expired deals, thin tools and unbodied alternatives", async () => {
    const d = await sitemapData();
    expect(d.deals.map((x) => x.slug)).not.toContain("quillwise-sample-q3");
    expect(d.tools).toContain("quillwise-writer");
    expect(d.tools).not.toContain("codely-assist"); // no content yet
    expect(d.alternatives).toEqual(["quillwise-writer-alternatives"]);
    expect(d.categories).not.toContain("design");
  });
});
