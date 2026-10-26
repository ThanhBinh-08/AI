import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/go/[brandId]/route";
import { getDeal, getTool, listDeals, listFeaturedDeals, listTools, search, sitemapData } from "@/data/repository";
import { FixtureSource } from "@/data/sheets/fixture-source";
import { resetStore } from "@/data/store";
import { createTracker, pageTypeOf, readConfig, trackingAllowed } from "@/lib/analytics";
import { goHref, readGoContext } from "@/lib/go";
import { resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  vi.stubEnv("AFFILIATE_EXTRA_HOSTS", "");
  resetStore(new FixtureSource());
  resetRateLimits();
});

describe("only checked deals are promoted", () => {
  it("keeps unchecked deals out of lists, featured slots, search, counts and the sitemap", async () => {
    const all = (await listDeals()).items;
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((d) => d.verification !== "unverified")).toBe(true);
    expect((await listFeaturedDeals({ limit: 8 })).every((d) => d.verification !== "unverified")).toBe(true);
    expect((await listDeals({ verification: "unverified" })).total).toBe(0);
    for (const q of ["off", "deal", "code"]) expect((await search(q)).deals.every((d) => d.verification !== "unverified")).toBe(true);
    const listed = new Set((await sitemapData()).deals.map((d) => d.slug));
    expect(all.every((d) => listed.has(d.slug))).toBe(true);
  });

  it("still opens an unchecked deal's own page, which the page marks and keeps out of the index", async () => {
    const page = await getDeal("framecast-f1");
    expect(page?.deal.verification).toBe("unverified");
    expect((await sitemapData()).deals.map((d) => d.slug)).not.toContain("framecast-f1");
  });

  it("counts only checked deals on tool cards and the tool offer", async () => {
    const tools = await listTools();
    const deals = (await listDeals()).items;
    for (const t of tools) expect(t.activeDeals).toBe(deals.filter((d) => d.brandId === t.brandId).length);
    const page = await getTool("quillwise-writer");
    expect(page?.deals.every((d) => d.verification !== "unverified")).toBe(true);
  });
});

describe("affiliate redirect", () => {
  const call = (brandId: string, query = "") =>
    GET(new Request(`http://localhost:3400/go/${brandId}/${query}`, { headers: { "x-forwarded-for": "203.0.113.7" } }), { params: Promise.resolve({ brandId }) });

  it("builds /go links with only a valid deal id and a known placement", () => {
    expect(goHref("quill")).toBe("/go/quill/");
    expect(goHref("quill", { offer: "Q1", from: "tool-offer" })).toBe("/go/quill/?o=Q1&p=tool-offer");
    expect(goHref("quill", { offer: "bad id!" })).toBe("/go/quill/");
    expect(readGoContext("/go/quill/?o=Q1&p=deal-row")).toEqual({ offer: "Q1", from: "deal-row" });
    expect(readGoContext("/go/quill/?o=<x>&p=evil")).toEqual({ offer: null, from: null });
  });

  it("goes to the same approved URL whatever the click context, and logs no personal data", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const plain = await call("quill");
    const labelled = await call("quill", "?o=Q1&p=tool-offer&url=https://evil.example.com");
    expect(labelled.headers.get("location")).toBe(plain.headers.get("location"));
    expect(log).toHaveBeenLastCalledWith("[go] click brand=quill offer=Q1 from=tool-offer");
    expect(String(log.mock.calls.at(-1))).not.toContain("203.0.113.7");
    log.mockRestore();
  });

  it("has no destination and no fallback for a brand without an approved link", async () => {
    const res = await call("codely");
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("analytics", () => {
  const on = readConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: "plausible", NEXT_PUBLIC_ANALYTICS_DOMAIN: "example.org" });
  const signals = { doNotTrack: false, optedOut: false, consent: null } as const;

  it("is off unless a provider and a domain are configured", () => {
    expect(readConfig({}).provider).toBeNull();
    expect(readConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: "plausible" }).provider).toBeNull();
    expect(trackingAllowed(readConfig({}), signals)).toBe(false);
    expect(trackingAllowed(on, signals)).toBe(true);
  });

  it("respects Do Not Track, opt-out and, when required, consent", () => {
    expect(trackingAllowed(on, { ...signals, doNotTrack: true })).toBe(false);
    expect(trackingAllowed(on, { ...signals, optedOut: true })).toBe(false);
    expect(trackingAllowed(on, { ...signals, consent: "denied" })).toBe(false);
    const ask = readConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: "plausible", NEXT_PUBLIC_ANALYTICS_DOMAIN: "example.org", NEXT_PUBLIC_ANALYTICS_CONSENT: "required" });
    expect(trackingAllowed(ask, signals)).toBe(false);
    expect(trackingAllowed(ask, { ...signals, consent: "granted" })).toBe(true);
  });

  it("counts an impression once per page view and drops double clicks", () => {
    let t = 0;
    const sent: string[] = [];
    const tr = createTracker((name, p) => sent.push(`${name}:${p.offer ?? ""}`), { windowMs: 1000, now: () => t });
    const props = { page_type: "tool", brand: "quill", offer: "Q1", placement: "tool-offer" };
    tr.track("coupon_impression", props);
    tr.track("coupon_impression", props);
    tr.track("affiliate_click", props);
    t = 300;
    tr.track("affiliate_click", props);
    t = 1500;
    tr.track("affiliate_click", props);
    tr.newPage();
    tr.track("coupon_impression", props);
    expect(sent).toEqual(["coupon_impression:Q1", "affiliate_click:Q1", "affiliate_click:Q1", "coupon_impression:Q1"]);
  });

  it("sends only the allowed fields", () => {
    const sent: Record<string, string>[] = [];
    const tr = createTracker((_n, p) => sent.push(p as unknown as Record<string, string>));
    tr.track("copy_code", { page_type: "deal", brand: "quill", offer: "Q1", placement: "deal-page", email: "a@b.c" } as never);
    expect(Object.keys(sent[0]!).sort()).toEqual(["brand", "offer", "page_type", "placement"]);
  });

  it("names page types from the path", () => {
    expect(pageTypeOf("/")).toBe("home");
    expect(pageTypeOf("/tools/aider/")).toBe("tool");
    expect(pageTypeOf("/deals/")).toBe("deals-list");
    expect(pageTypeOf("/blog/x/")).toBe("blog");
    expect(pageTypeOf("/search/")).toBe("search");
  });
});

describe("blog routes never render coupon widgets", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });

  it("blog pages and blog components do not use the code/copy components", () => {
    const blog = [...files(path.join(process.cwd(), "src/app/(site)/blog")), ...files(path.join(process.cwd(), "src/components/blog"))];
    expect(blog.length).toBeGreaterThan(0);
    for (const f of blog) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\b(CopyCode|DealList|DealRow|DealTicket)\b/);
    }
  });
});
