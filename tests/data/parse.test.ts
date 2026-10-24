import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "@/data/schemas/parse";
import { emptyTabs, type RawTabs } from "@/data/sheets/source";

const fixture = JSON.parse(readFileSync("tests/fixtures/sheet.json", "utf8")) as RawTabs;
const NOW = new Date("2026-10-22T12:00:00Z");
const parsed = () => parseCatalog(fixture, NOW, []);

describe("parseCatalog", () => {
  it("keeps the first of duplicate brand ids and reports the second", () => {
    const { catalog } = parsed();
    expect(catalog.brands.filter((b) => b.id === "quill")).toHaveLength(1);
    expect(catalog.brands.find((b) => b.id === "quill")?.name).toBe("Quillwise (sample)");
    expect(catalog.issues.some((i) => i.tab === "Brands" && /duplicate brand_id quill/.test(i.message))).toBe(true);
  });

  it("derives slugs and normalises category names", () => {
    const { catalog } = parsed();
    expect(catalog.brands.find((b) => b.id === "quill")?.slug).toBe("quillwise-sample");
    expect(catalog.brands.find((b) => b.id === "codely")?.categories).toEqual(["ai-coding"]);
  });

  it("enables the CTA only for published brands with an approved, valid, allowed https link", () => {
    const { catalog, affiliateUrls } = parsed();
    const by = (id: string) => catalog.brands.find((b) => b.id === id)!;
    expect(by("quill").hasAffiliate).toBe(true);
    expect(by("codely").hasAffiliate).toBe(false); // program pending
    expect(by("draftco").hasAffiliate).toBe(false); // brand draft
    expect(by("insecure").hasAffiliate).toBe(false); // http
    expect(by("offlist").hasAffiliate).toBe(false); // host not allowed
    expect(affiliateUrls.has("insecure")).toBe(false);
    expect(affiliateUrls.has("offlist")).toBe(false);
    expect(catalog.issues.some((i) => /must use https/.test(i.message))).toBe(true);
    expect(catalog.issues.some((i) => /not the brand domain or an allowed affiliate network/.test(i.message))).toBe(true);
  });

  it("never guesses dates: ambiguous slash dates skip the coupon", () => {
    const { catalog } = parsed();
    expect(catalog.coupons.some((c) => c.id === "F3")).toBe(false);
    expect(catalog.issues.some((i) => /10\/11\/2026/.test(i.message))).toBe(true);
  });

  it("marks past end dates as expired and drops drafts and unknown brands", () => {
    const { catalog } = parsed();
    expect(catalog.coupons.find((c) => c.id === "Q3")?.status).toBe("expired");
    expect(catalog.coupons.some((c) => c.id === "Q4")).toBe(false);
    expect(catalog.coupons.some((c) => c.id === "X1")).toBe(false);
  });

  it("shows checkout_tested without a date as unverified", () => {
    const { catalog } = parsed();
    const f2 = catalog.coupons.find((c) => c.id === "F2")!;
    expect(f2.verification).toBe("unverified");
    expect(catalog.issues.some((i) => /checkout_tested needs a verified_at date/.test(i.message))).toBe(true);
  });

  it("keeps only the hostname of source_url and never exposes it as a link", () => {
    const q1 = parsed().catalog.coupons.find((c) => c.id === "Q1")!;
    expect(q1.sourceHost).toBe("quillwise.example.org");
    expect(JSON.stringify(q1)).not.toContain("https://quillwise.example.org");
  });

  it("hides a price that has no checked date", () => {
    const frame = parsed().catalog.products.find((p) => p.id === "frame-app")!;
    expect(frame.pricing).toBe("");
    const quill = parsed().catalog.products.find((p) => p.id === "quill-app")!;
    expect(quill.pricing).toContain("$12");
    expect(quill.features).toHaveLength(3);
    expect(quill.useCases).toEqual(["Blog posts", "Product emails"]);
  });

  it("does not put affiliate URLs in the page models", () => {
    const { catalog } = parsed();
    expect(JSON.stringify(catalog)).not.toContain("sjv.io");
  });

  it("ignores a tab whose required columns are missing, without crashing", () => {
    const tabs = emptyTabs();
    tabs.Brands = [["name"], ["Only a name"]];
    const { catalog } = parseCatalog(tabs, NOW, []);
    expect(catalog.brands).toEqual([]);
    expect(catalog.issues[0]?.message).toMatch(/missing column\(s\): brand_id/);
  });

  it("handles a completely empty workbook", () => {
    const { catalog } = parseCatalog(emptyTabs(), NOW, []);
    expect(catalog).toMatchObject({ brands: [], coupons: [], products: [], posts: [], issues: [] });
  });

  it("reads header names case-insensitively and with spaces", () => {
    const tabs = emptyTabs();
    tabs.Brands = [["Brand ID", "Name", "Status"], ["b1", "Alpha", "Published"]];
    const { catalog } = parseCatalog(tabs, NOW, []);
    expect(catalog.brands[0]).toMatchObject({ id: "b1", status: "published" });
  });
});
