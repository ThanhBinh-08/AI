import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/deals/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));

import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import { RevealCode } from "@/components/deals/RevealCode";
import { adaptNormalized, emptyNormalized } from "@/data/normalized/adapt";
import { HEADERS } from "@/data/normalized/schema";
import { getHome, listFeaturedDeals } from "@/data/repository";
import { parseCatalog } from "@/data/schemas/parse";
import type { RawTabs, SheetSource } from "@/data/sheets/source";
import { resetStore } from "@/data/store";
import { featuredRank, isFeaturedEligible, orderFeatured, selectFeatured } from "@/lib/featured";
import { resetRateLimits } from "@/lib/rate-limit";
import type { Brand, DealView } from "@/types/catalog";

const NOW = new Date("2026-10-26T12:00:00Z");

/* ------------------------------------------------------------------------------------------------
 * Test data: a workbook in the live normalized layout, never the production Sheet.
 * ---------------------------------------------------------------------------------------------- */

const row = (tab: keyof typeof HEADERS, v: Record<string, string>) => HEADERS[tab].map((h) => v[h] ?? "");

const TOOLS: Record<string, string>[] = [
  { tool_id: "T1", name: "Alpha", slug: "alpha", affiliate_url: "https://alpha.ai/?ref=site", cat: "CAT001" },
  { tool_id: "T2", name: "Beta", slug: "beta", affiliate_url: "https://beta.io", cat: "CAT001" },
  { tool_id: "T3", name: "Gamma", slug: "gamma", affiliate_url: "https://gamma.app", cat: "CAT003" },
  { tool_id: "T4", name: "Nolink", slug: "nolink", affiliate_url: "", cat: "CAT001" },
  { tool_id: "T5", name: "Fiction", slug: "fiction", affiliate_url: "https://fiction.example.com", cat: "CAT001", source_name: "Fictional sample" },
];

const deal = (v: Record<string, string>) => ({
  title: `${v.deal_id} title`,
  discount: "20% off",
  expires_at: "2099-12-31",
  verification_status: "verified",
  updated_at: "2026-10-20",
  publish_status: "published",
  is_featured: "TRUE",
  ...v,
});

const DEALS = [
  deal({ deal_id: "D1", tool_id: "T1", coupon_code: "ALPHA20", featured_order: "2" }),
  deal({ deal_id: "D2", tool_id: "T2", coupon_code: "", discount: "2 months free", featured_order: "1" }),
  deal({ deal_id: "D3", tool_id: "T3", coupon_code: "GAMMA", featured_order: "" }), // no order: after ordered ones
  deal({ deal_id: "D4", tool_id: "T1", coupon_code: "ALPHA-OLD", featured_order: "3", expires_at: "2026-10-25" }), // expired
  deal({ deal_id: "D5", tool_id: "T2", coupon_code: "UNCHECKED", featured_order: "1", verification_status: "unverified" }),
  deal({ deal_id: "D6", tool_id: "T4", coupon_code: "NOLINK", featured_order: "1" }), // tool has no link
  deal({ deal_id: "D7", tool_id: "T5", coupon_code: "FICTION", featured_order: "1" }), // fictional tool
  deal({ deal_id: "D8", tool_id: "T3", coupon_code: "NOTPICKED", is_featured: "FALSE", featured_order: "1" }),
  deal({ deal_id: "D9", tool_id: "T3", coupon_code: "LASTDAY", featured_order: "4", expires_at: "2026-10-26" }), // last day: still live
];

function workbook(deals = DEALS) {
  const raw = emptyNormalized();
  raw.Categories = [
    [...HEADERS.Categories],
    row("Categories", { category_id: "CAT001", category_name: "AI Writing", slug: "ai-writing", status: "active" }),
    row("Categories", { category_id: "CAT003", category_name: "AI Video", slug: "ai-video", status: "active" }),
  ];
  raw.Tools = [
    [...HEADERS.Tools],
    ...TOOLS.map((t) => row("Tools", { ...t, short_description: `${t.name} does things.`, publish_status: "published", data_source_type: "manually_entered", verification_status: "verified" })),
  ];
  raw.Tool_Categories = [[...HEADERS.Tool_Categories], ...TOOLS.map((t, i) => row("Tool_Categories", { tool_category_id: `TC${i}`, tool_id: t.tool_id!, category_id: t.cat!, is_primary: "TRUE" }))];
  raw.Deals = [[...HEADERS.Deals], ...deals.map((d) => row("Deals", d))];
  return raw;
}

class WorkbookSource implements SheetSource {
  readonly kind = "fixture" as const;
  constructor(private readonly deals = DEALS) {}
  async fetchTabs(): Promise<RawTabs> {
    return adaptNormalized(workbook(this.deals), { allowPreview: false }).tabs;
  }
}

function catalogOf(deals = DEALS) {
  const { tabs, issues } = adaptNormalized(workbook(deals), { allowPreview: false, now: NOW });
  return { catalog: parseCatalog(tabs, NOW, []).catalog, issues };
}

function views(deals = DEALS): DealView[] {
  const { catalog } = catalogOf(deals);
  const brands = new Map(catalog.brands.map((b) => [b.id, b]));
  return catalog.coupons.flatMap((c) => (brands.get(c.brandId) ? [{ ...c, brand: brands.get(c.brandId)!, active: true }] : []));
}

beforeEach(() => {
  vi.stubEnv("AFFILIATE_EXTRA_HOSTS", "");
  pathname = "/deals/";
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/* ------------------------------------------- Sheet mapping ------------------------------------------- */

describe("Deals.is_featured and Deals.featured_order mapping", () => {
  it("maps TRUE to featured with its order, and FALSE / empty to not featured", () => {
    const { catalog } = catalogOf();
    const by = new Map(catalog.coupons.map((c) => [c.id, c]));
    expect(by.get("D1")).toMatchObject({ featured: true, featuredOrder: 2 });
    expect(by.get("D3")).toMatchObject({ featured: true, featuredOrder: null });
    expect(by.get("D8")?.featured).toBeUndefined();
    expect(catalogOf([deal({ deal_id: "E1", tool_id: "T1", is_featured: "", featured_order: "1" })]).catalog.coupons[0]?.featured).toBeUndefined();
  });

  it("accepts a Sheets checkbox (TRUE / true) and reports anything else instead of guessing", () => {
    const { catalog, issues } = catalogOf([
      deal({ deal_id: "E1", tool_id: "T1", is_featured: "true" }),
      deal({ deal_id: "E2", tool_id: "T1", is_featured: "yes", coupon_code: "Y" }),
      deal({ deal_id: "E3", tool_id: "T1", is_featured: "1", coupon_code: "Z" }),
    ]);
    const by = new Map(catalog.coupons.map((c) => [c.id, c]));
    expect(by.get("E1")?.featured).toBe(true);
    expect(by.get("E2")?.featured).toBeUndefined();
    expect(by.get("E3")?.featured).toBeUndefined();
    // The deal itself stays listed; only the featured flag is ignored.
    expect(by.has("E2")).toBe(true);
    expect(issues.filter((i) => /is_featured ".*" is not TRUE or FALSE/.test(i.message))).toHaveLength(2);
  });

  it("keeps only positive whole numbers as featured_order", () => {
    const orders = ["0", "-1", "1.5", "abc", "7", " 3 "];
    const { catalog, issues } = catalogOf(orders.map((o, i) => deal({ deal_id: `E${i}`, tool_id: "T1", coupon_code: `C${i}`, featured_order: o })));
    expect(catalog.coupons.map((c) => c.featuredOrder)).toEqual([null, null, null, null, 7, 3]);
    expect(issues.filter((i) => /featured_order .* is not a positive whole number/.test(i.message))).toHaveLength(4);
  });

  it("reports a featured_order used twice, and orders those deals by deal_id", () => {
    const { issues } = catalogOf([
      deal({ deal_id: "E2", tool_id: "T1", coupon_code: "B", featured_order: "1" }),
      deal({ deal_id: "E1", tool_id: "T2", coupon_code: "A", featured_order: "1" }),
    ]);
    expect(issues.some((i) => i.message === "featured_order 1 is used by E2, E1; they are ordered by deal_id")).toBe(true);
    expect(selectFeatured(views([
      deal({ deal_id: "E2", tool_id: "T1", coupon_code: "B", featured_order: "1" }),
      deal({ deal_id: "E1", tool_id: "T2", coupon_code: "A", featured_order: "1" }),
    ]), {}, NOW).map((d) => d.id)).toEqual(["E1", "E2"]);
  });

  it("reads a Deals tab without the two columns (older Sheets): nothing is featured", () => {
    const raw = workbook();
    const keep = HEADERS.Deals.filter((h) => h !== "is_featured" && h !== "featured_order");
    raw.Deals = [keep, ...DEALS.map((d) => keep.map((h) => (d as Record<string, string>)[h] ?? ""))];
    const { tabs, issues } = adaptNormalized(raw, { allowPreview: false, now: NOW });
    expect(issues.filter((i) => /missing column/.test(i.message))).toEqual([]);
    expect(parseCatalog(tabs, NOW, []).catalog.coupons.some((c) => c.featured)).toBe(false);
  });
});

/* ------------------------------------------- Selection rules ------------------------------------------- */

describe("featured selection", () => {
  const all = views();

  it("takes only explicitly featured, live, checked deals with a working /go/ link", () => {
    expect(selectFeatured(all, { limit: 8 }, NOW).map((d) => d.id)).toEqual(["D2", "D1", "D9", "D3"]);
  });

  it("leaves out expired, unchecked, unlinked, fictional and unpicked deals", () => {
    const ids = new Set(selectFeatured(all, { limit: 8 }, NOW).map((d) => d.id));
    for (const id of ["D4", "D5", "D6", "D7", "D8"]) expect(ids.has(id)).toBe(false);
  });

  it("does not feature a deal because its tool is featured (Tools.featured)", () => {
    const d = all.find((x) => x.id === "D8")!;
    expect(isFeaturedEligible({ ...d, brand: { ...d.brand, featured: true } }, NOW)).toBe(false);
  });

  it("refuses drafts, empty discounts, sample rows and brands without a link", () => {
    const d = all.find((x) => x.id === "D1")!;
    expect(isFeaturedEligible(d, NOW)).toBe(true);
    expect(isFeaturedEligible({ ...d, status: "draft" }, NOW)).toBe(false);
    expect(isFeaturedEligible({ ...d, discount: " " }, NOW)).toBe(false);
    expect(isFeaturedEligible({ ...d, sample: true }, NOW)).toBe(false);
    expect(isFeaturedEligible({ ...d, brand: { ...d.brand, hasAffiliate: false } }, NOW)).toBe(false);
    expect(isFeaturedEligible({ ...d, brand: { ...d.brand, status: "draft" } as Brand }, NOW)).toBe(false);
    expect(isFeaturedEligible({ ...d, expiresAt: null }, NOW)).toBe(true); // no end date: stays live
  });

  it("sorts by featured_order, missing orders last, ties by deal_id, whatever the input order", () => {
    const shuffled = [...all].reverse();
    expect(selectFeatured(shuffled, { limit: 8 }, NOW).map((d) => d.id)).toEqual(selectFeatured(all, { limit: 8 }, NOW).map((d) => d.id));
    expect(orderFeatured([{ id: "B", featuredOrder: null }, { id: "A", featuredOrder: null }, { id: "C", featuredOrder: 1 }]).map((x) => x.id)).toEqual(["C", "A", "B"]);
    expect(featuredRank({ featuredOrder: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(featuredRank({ featuredOrder: 2.5 })).toBe(Number.POSITIVE_INFINITY);
  });

  it("shows each deal and each offer once", () => {
    const d1 = all.find((x) => x.id === "D1")!;
    const copy = { ...d1, id: "D1b", slug: "alpha-d1b", featuredOrder: 9 }; // same brand and code under another id
    const out = selectFeatured([d1, d1, copy], { limit: 8 }, NOW);
    expect(out.map((d) => d.id)).toEqual(["D1"]);
  });

  it("caps the count and shows fewer cards when fewer deals qualify, never padding", () => {
    expect(selectFeatured(all, {}, NOW).map((d) => d.id)).toEqual(["D2", "D1", "D9"]);
    expect(selectFeatured(all, { limit: 2 }, NOW).map((d) => d.id)).toEqual(["D2", "D1"]);
    expect(selectFeatured(all, { limit: 100 }, NOW)).toHaveLength(4);
    expect(selectFeatured(all.filter((d) => d.id === "D3"), {}, NOW).map((d) => d.id)).toEqual(["D3"]);
    expect(selectFeatured([], {}, NOW)).toEqual([]);
  });

  it("keeps a placement relevant: brands or categories of the page, minus what it already shows", () => {
    expect(selectFeatured(all, { categories: ["ai-video"] }, NOW).map((d) => d.id)).toEqual(["D9", "D3"]);
    expect(selectFeatured(all, { brandIds: ["T1"] }, NOW).map((d) => d.id)).toEqual(["D1"]);
    expect(selectFeatured(all, { categories: ["ai-writing"], exclude: ["D2"] }, NOW).map((d) => d.id)).toEqual(["D1"]);
    expect(selectFeatured(all, { categories: ["marketing"] }, NOW)).toEqual([]);
  });

  it("fills a placement with other featured deals after the relevant ones, never with unpicked deals", () => {
    expect(selectFeatured(all, { categories: ["marketing"], fill: true }, NOW).map((d) => d.id)).toEqual(["D2", "D1", "D9"]);
    expect(selectFeatured(all, { brandIds: ["T3"], fill: true, exclude: ["D9"] }, NOW).map((d) => d.id)).toEqual(["D3", "D2", "D1"]);
    expect(selectFeatured(all, { categories: ["ai-video"], fill: true, limit: 8 }, NOW).map((d) => d.id)).not.toContain("D8");
  });
});

/* ------------------------------------------- Repository ------------------------------------------- */

describe("featured deals from the data layer", () => {
  beforeEach(() => resetStore(new WorkbookSource()));

  it("serves three deals, relevant ones first, then other featured deals", async () => {
    expect((await listFeaturedDeals()).map((d) => d.id)).toEqual(["D2", "D1", "D9"]);
    expect((await listFeaturedDeals({ categories: ["ai-video"] })).map((d) => d.id)).toEqual(["D9", "D3", "D2"]);
    expect((await listFeaturedDeals({ categories: ["ai-video"], fill: false })).map((d) => d.id)).toEqual(["D9", "D3"]);
  });

  it("does not repeat a featured deal in the Home latest-deals list", async () => {
    const home = await getHome();
    const featured = new Set(home.featuredDeals.map((d) => d.id));
    expect(featured.size).toBeGreaterThan(0);
    expect(home.deals.some((d) => featured.has(d.id))).toBe(false);
  });

  it("is empty when nothing is featured, so no section renders", async () => {
    resetStore(new WorkbookSource(DEALS.map((d) => ({ ...d, is_featured: "FALSE" }))));
    expect(await listFeaturedDeals()).toEqual([]);
  });
});

/* ------------------------------------------- Components ------------------------------------------- */

describe("FeaturedDeals", () => {
  const deals = () => selectFeatured(views(), {}, NOW);

  it("renders nothing without deals", () => {
    const { container } = render(<FeaturedDeals deals={[]} id="fd" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows brand, discount, title, check, end date and the right CTA on every card", () => {
    render(<FeaturedDeals deals={deals()} id="fd" />);
    expect(screen.getByRole("heading", { level: 2, name: "Featured deals" })).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveClass("is-lead");
    expect(cards[1]).not.toHaveClass("is-lead");

    const alpha = within(cards[1]!);
    expect(alpha.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/brands/alpha/");
    expect(alpha.getByText("20%")).toBeInTheDocument();
    expect(alpha.getByText("off")).toBeInTheDocument();
    expect(alpha.getByRole("link", { name: "D1 title" })).toHaveAttribute("href", "/deals/alpha-d1/");
    expect(alpha.getByText(/Source checked Oct 20, 2026/)).toBeInTheDocument();
    expect(alpha.getByText(/Ends Dec 31, 2099/)).toBeInTheDocument();
    expect(alpha.getByRole("button", { name: /Reveal and copy the code/ })).toHaveTextContent("Reveal Code");
    // The code is not printed before the reveal (only inside <noscript>).
    expect(alpha.queryByText("ALPHA20", { selector: ":not(noscript) code" })).toBeNull();
    const cta = alpha.getByRole("link", { name: /Get Deal/ });
    expect(cta).toHaveAttribute("href", "/go/T1/?o=D1&p=featured");
    expect(cta).toHaveAttribute("rel", "sponsored nofollow noopener");
    expect(cta).toHaveAttribute("data-track", "affiliate_click");
    expect(cards[1]).toHaveAttribute("data-impression");
    expect(cards[1]).toHaveAttribute("data-offer", "D1");
  });

  it("leaves the code slot empty and offers no Reveal Code for a deal without a code", () => {
    render(<FeaturedDeals deals={deals()} id="fd" />);
    const beta = within(screen.getAllByRole("listitem")[0]!);
    expect(beta.queryByText(/No code/)).toBeNull();
    expect(beta.queryByRole("button", { name: /Reveal/ })).toBeNull();
    expect(beta.getByRole("link", { name: /Get Deal/ })).toHaveAttribute("href", "/go/T2/?o=D2&p=featured");
  });

  it("shows urgency only from the stored end date", () => {
    render(<FeaturedDeals deals={deals()} id="fd" />);
    expect(screen.getByText("Ends today")).toHaveClass("urgent");
  });

  it("claims nothing the data does not hold, and discloses the affiliate links", () => {
    const { container } = render(<FeaturedDeals deals={deals()} id="fd" />);
    expect(container.textContent).not.toMatch(/popular|trending|best seller|limited|only \d+ left|rating|★|you save|hot deal/i);
    expect(screen.getByRole("link", { name: "Affiliate disclosure" })).toHaveAttribute("href", "/affiliate-disclosure/");
  });

  it("links to the Deals page except on the Deals page itself", () => {
    const { rerender } = render(<FeaturedDeals deals={deals()} id="fd" />);
    expect(screen.getByRole("link", { name: "All deals" })).toHaveAttribute("href", "/deals/");
    rerender(<FeaturedDeals deals={deals()} id="fd" showAllLink={false} />);
    expect(screen.queryByRole("link", { name: "All deals" })).toBeNull();
  });

  it("shows at most three cards: one lead, two beside it", () => {
    const more = selectFeatured(views(), { limit: 8 }, NOW);
    expect(more.length).toBeGreaterThan(3);
    const { container } = render(<FeaturedDeals deals={more} id="fd" />);
    expect(container.querySelector(".fd-grid")).toHaveAttribute("data-count", "3");
    expect(container.querySelectorAll(".fd-card.is-lead")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("Reveal Code", () => {
  it("reveals and copies the exact code, then keeps a Copy button focused", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<RevealCode code="ALPHA-20%x" label="Alpha 20% off" brand="T1" offer="D1" placement="featured" />);
    const btn = screen.getByRole("button", { name: "Reveal and copy the code for Alpha 20% off" });
    expect(btn).toHaveAttribute("data-track", "copy_code");
    expect(btn).toHaveAttribute("data-offer", "D1");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(writeText).toHaveBeenCalledWith("ALPHA-20%x");
    expect(screen.getByText("ALPHA-20%x")).toBeInTheDocument();
    const copy = screen.getByRole("button", { name: "Copy code ALPHA-20%x" });
    expect(copy).toHaveTextContent("Copied");
    expect(copy).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Code ALPHA-20%x copied");
  });

  it("still shows the code when the clipboard is blocked", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<RevealCode code="X1" label="X" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reveal/ }));
    });
    expect(screen.getByText("X1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code X1" })).toHaveTextContent("Select it");
  });

  it("renders nothing on Blog routes", () => {
    pathname = "/blog/a-post/";
    const { container } = render(<RevealCode code="SECRET" label="X" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FeaturedDeals on the Blog (editorial)", () => {
  it("names the deals without any code, copy control or outbound link", () => {
    pathname = "/blog/a-post/";
    const deals = selectFeatured(views(), {}, NOW);
    const { container } = render(<FeaturedDeals deals={deals} id="pm" editorial />);
    expect(container.textContent).not.toMatch(/ALPHA20|GAMMA|LASTDAY|Reveal|Copy|Get Deal/);
    for (const a of container.querySelectorAll("a")) expect(a.getAttribute("href")).not.toMatch(/^\/go\//);
    expect(screen.getAllByRole("link", { name: /View deal/ })[0]).toHaveAttribute("href", "/deals/beta-d2/");
    expect(container.querySelector("[data-impression]")).toBeNull();
  });
});

/* ------------------------------------------- Page templates ------------------------------------------- */

describe("page templates", () => {
  beforeEach(() => {
    resetStore(new WorkbookSource());
    resetRateLimits();
  });

  const sections = (c: HTMLElement) => [...c.querySelectorAll("section.fd")].map((s) => s.querySelector("h2")?.textContent);

  it("Deals: hero, then Featured deals, then search, filters and All deals", async () => {
    const { default: DealsPage } = await import("@/app/(site)/deals/(list)/page");
    const { container } = render(await DealsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { level: 1, name: "AI Tool Deals & Coupon Codes" })).toBeInTheDocument();
    const order = [...container.querySelectorAll("h1, h2")].map((h) => h.textContent);
    expect(order).toEqual(["AI Tool Deals & Coupon Codes", "Featured deals", "All deals"]);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(container.querySelectorAll(".fd-card")).toHaveLength(3);
    // No brand grid or category blocks on the page.
    expect(container.querySelector(".brand-card, .mk-keys, [role=tab]")).toBeNull();
  });

  it("Deals: a filtered link leads with its results", async () => {
    const { default: DealsPage } = await import("@/app/(site)/deals/(list)/page");
    const { container } = render(await DealsPage({ searchParams: Promise.resolve({ category: "ai-video" }) }));
    expect(container.querySelector("section.fd")).toBeNull();
    // Every live, checked AI Video deal, featured or not (D3, D8, D9).
    expect(container.querySelectorAll(".deal-row")).toHaveLength(3);
  });

  it("Deals: canonical stays /deals/, filtered views are noindex", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://deals-site.test");
    const { generateMetadata } = await import("@/app/(site)/deals/(list)/page");
    const plain = await generateMetadata({ searchParams: Promise.resolve({}) });
    const filtered = await generateMetadata({ searchParams: Promise.resolve({ q: "alpha" }) });
    expect(plain.alternates?.canonical).toMatch(/\/deals\/$/);
    expect(plain.robots).not.toMatchObject({ index: false });
    expect(filtered.robots).toMatchObject({ index: false });
  });

  it("Category: featured deals of that category on top, not repeated in its deal list", async () => {
    const { default: CategoryPage } = await import("@/app/(site)/categories/[slug]/page");
    const { container } = render(await CategoryPage({ params: Promise.resolve({ slug: "ai-video" }) }));
    expect(sections(container)).toEqual(["Featured deals"]);
    const featured = [...container.querySelectorAll(".fd-card")].map((c) => c.getAttribute("data-offer"));
    expect(featured).toEqual(["D9", "D3", "D2"]);
    const listed = [...container.querySelectorAll(".deal-row")].map((r) => r.getAttribute("data-offer"));
    expect(listed.some((id) => featured.includes(id))).toBe(false);
  });

  it("Tool: featured deals never repeat the tool's own deals or any deal already on the page", async () => {
    const { default: ToolPage } = await import("@/app/(site)/tools/[slug]/page");
    for (const slug of ["alpha", "beta", "gamma", "nolink"]) {
      const { container, unmount } = render(await ToolPage({ params: Promise.resolve({ slug }) }));
      const featured = [...container.querySelectorAll(".fd-card")].map((c) => c.getAttribute("data-offer"));
      const elsewhere = [...container.querySelectorAll("[data-offer]")].filter((el) => !el.closest(".fd-card")).map((c) => c.getAttribute("data-offer"));
      expect(featured.filter((id) => elsewhere.includes(id))).toEqual([]);
      const own = TOOLS.find((t) => t.slug === slug)!.tool_id;
      expect([...container.querySelectorAll(".fd-card")].map((c) => c.getAttribute("data-brand"))).not.toContain(own);
      unmount();
    }
  });

  it("Brand: featured deals of other brands in the same categories, after its own deals", async () => {
    const { default: BrandPage } = await import("@/app/(site)/brands/[slug]/page");
    const { container } = render(await BrandPage({ params: Promise.resolve({ slug: "beta" }) }));
    expect(sections(container)).toEqual(["Featured deals"]);
    expect([...container.querySelectorAll(".fd-card")].map((c) => c.getAttribute("data-offer"))).toEqual(["D1", "D9", "D3"]);
  });

  it("Tools directory: one featured section of three", async () => {
    const { default: ToolsPage } = await import("@/app/(site)/tools/(list)/page");
    const { container } = render(await ToolsPage({ searchParams: Promise.resolve({}) }));
    expect(container.querySelectorAll("section.fd")).toHaveLength(1);
    expect(container.querySelectorAll(".fd-card")).toHaveLength(3);
  });

  it("every page shows the same three-card block once", async () => {
    const pages: [string, () => Promise<React.ReactElement>][] = [
      ["brands", async () => (await import("@/app/(site)/brands/page")).default()],
      ["categories", async () => (await import("@/app/(site)/categories/page")).default()],
      ["compare", async () => (await import("@/app/(site)/compare/page")).default()],
      ["alternatives", async () => (await import("@/app/(site)/alternatives/page")).default()],
      ["contact", async () => (await import("@/app/(site)/contact/page")).default()],
      ["about", async () => (await import("@/app/(site)/[page]/page")).default({ params: Promise.resolve({ page: "about" }) })],
      ["deal", async () => (await import("@/app/(site)/deals/[slug]/page")).default({ params: Promise.resolve({ slug: "alpha-d1" }) })],
      ["search", async () => (await import("@/app/(site)/search/page")).default({ searchParams: Promise.resolve({}) })],
    ];
    for (const [name, page] of pages) {
      const { container, unmount } = render(await page());
      expect(container.querySelectorAll("section.fd"), name).toHaveLength(1);
      const offers = [...container.querySelectorAll(".fd-card")].map((c) => c.getAttribute("data-offer"));
      // Three whenever three featured deals are left after removing those the page already shows.
      expect(offers.length, name).toBe(name === "deal" ? 2 : 3);
      expect(new Set(offers).size, name).toBe(offers.length);
      unmount();
    }
  });

  it("the deal page never features the deal it is about", async () => {
    const { default: DealPage } = await import("@/app/(site)/deals/[slug]/page");
    const { container } = render(await DealPage({ params: Promise.resolve({ slug: "alpha-d1" }) }));
    expect([...container.querySelectorAll(".fd-card")].map((c) => c.getAttribute("data-offer"))).not.toContain("D1");
  });

  it("Search: related featured deals with results, general ones when nothing matches", async () => {
    const { default: SearchPage } = await import("@/app/(site)/search/page");
    const hit = render(await SearchPage({ searchParams: Promise.resolve({ q: "gamma" }) }));
    const offers = [...hit.container.querySelectorAll(".fd-card")].map((c) => c.getAttribute("data-offer"));
    const listed = [...hit.container.querySelectorAll(".deal-row")].map((r) => r.getAttribute("data-offer"));
    expect(offers.every((o) => !listed.includes(o))).toBe(true);
    hit.unmount();
    const miss = render(await SearchPage({ searchParams: Promise.resolve({ q: "zzzz-nothing" }) }));
    expect(miss.container.querySelectorAll(".fd-card").length).toBeGreaterThan(0);
  });
});
