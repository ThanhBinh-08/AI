/**
 * The Deals page list: a compact, public view of every eligible coupon, and the search / filter / sort functions that
 * run on it. No server-only code, so the browser filters the same data the server rendered, without another request
 * to the data source.
 *
 * Nothing here exposes a Sheet column, a row number or a raw affiliate URL. Records are keyed by their slug; the only
 * internal id that reaches the page is inside the existing /go/<brandId>/ redirect link, and only for brands that
 * have a working link.
 */
import { CATEGORIES } from "@/config/categories";
import { isEligibleCoupon } from "@/lib/coupon-rules";
import { goHref } from "@/lib/go";
import type { Brand, Catalog, Verification } from "@/types/catalog";

export const MAX_QUERY = 80;

export interface MarketCategory {
  slug: string;
  name: string;
  /** Coupons of brands in the category. Only categories with at least one are listed. */
  coupons: number;
}

export interface MarketCoupon {
  slug: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  categories: string[];
  title: string;
  discount: string;
  /** The exact stored code, or null for a deal that needs no code. */
  code: string | null;
  terms: string;
  expiresAt: string | null;
  /** How it was checked. */
  verification: Verification;
  verifiedAt: string | null;
  /** /go/<tool_id>/ when the tool's Tools row has a usable link; null otherwise. */
  goHref: string | null;
}

export interface Market {
  coupons: MarketCoupon[];
  categories: MarketCategory[];
}

/** Brands whose coupons may be listed: published and not fictional. Sample data never reaches the Deals page. */
const isListedBrand = (b: Brand) => b.status === "published" && !b.sample && !b.preview;

export function buildMarket(c: Catalog, now: Date = new Date()): Market {
  const byId = new Map(c.brands.filter(isListedBrand).map((b) => [b.id, b]));
  const go = (b: Brand, offer?: string) => (b.hasAffiliate ? goHref(b.id, { offer, from: "deals-market" }) : null);

  const coupons: MarketCoupon[] = [];
  for (const x of c.coupons) {
    const b = byId.get(x.brandId);
    if (!b || x.sample || !isEligibleCoupon(x, b, now)) continue;
    coupons.push({
      slug: x.slug,
      brandSlug: b.slug,
      brandName: b.name,
      brandLogo: b.logoUrl,
      categories: b.categories,
      title: x.title,
      discount: x.discount,
      code: x.code,
      terms: x.terms,
      expiresAt: x.expiresAt,
      verification: x.verification,
      verifiedAt: x.verifiedAt,
      goHref: go(b, x.id),
    });
  }

  const categories = CATEGORIES.map((def) => ({
    slug: def.slug,
    name: def.name,
    coupons: coupons.filter((k) => k.categories.includes(def.slug)).length,
  })).filter((x) => x.coupons > 0);

  return { coupons: sortCoupons(coupons, "verified"), categories };
}

/* ------------------------------------------- Search ------------------------------------------- */

/** Lower case, accents removed, only letters, digits, % and $ kept; at most 8 terms of an 80-character query. */
export function queryTerms(q: string): string[] {
  return fold(q.slice(0, MAX_QUERY))
    .split(/[^a-z0-9%$]+/)
    .filter(Boolean)
    .slice(0, 8);
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? "";

/** Text a coupon is found by: brand, title, category, code and discount. */
export const couponHaystack = (k: MarketCoupon) =>
  fold(`${k.brandName} ${k.title} ${k.categories.map(categoryName).join(" ")} ${k.code ?? ""} ${k.discount}`);

const matchesAll = (hay: string, terms: string[]) => terms.every((t) => hay.includes(t));

/* ------------------------------------------- Filters ------------------------------------------- */

export type CouponSort = "verified" | "ending" | "brand";

export const COUPON_SORTS: readonly CouponSort[] = ["verified", "ending", "brand"];
export const COUPON_STATUSES: readonly MarketCoupon["verification"][] = ["checkout_tested", "source_verified"];

export interface MarketFilters {
  q?: string;
  category?: string;
  brand?: string;
  /** How the code was checked. */
  check?: MarketCoupon["verification"];
  sort?: CouponSort;
}

const VERIFICATION_RANK = { checkout_tested: 2, source_verified: 1, unverified: 0 } as const;

export function sortCoupons(list: MarketCoupon[], sort: CouponSort = "verified"): MarketCoupon[] {
  const out = [...list];
  if (sort === "brand") return out.sort((a, b) => a.brandName.localeCompare(b.brandName, "en") || a.slug.localeCompare(b.slug));
  // A coupon without an end date sorts after every dated one.
  if (sort === "ending") return out.sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999") || a.slug.localeCompare(b.slug));
  return out.sort(
    (a, b) =>
      (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? "") ||
      VERIFICATION_RANK[b.verification] - VERIFICATION_RANK[a.verification] ||
      a.slug.localeCompare(b.slug),
  );
}

export function filterCoupons(list: MarketCoupon[], f: MarketFilters, hay: (k: MarketCoupon) => string = couponHaystack): MarketCoupon[] {
  const terms = queryTerms(f.q ?? "");
  const out = list.filter(
    (k) =>
      (!f.category || k.categories.includes(f.category)) &&
      (!f.brand || k.brandSlug === f.brand) &&
      (!f.check || k.verification === f.check) &&
      (terms.length === 0 || matchesAll(hay(k), terms)),
  );
  return sortCoupons(out, f.sort);
}

/** True when any filter or search narrows the list (sorting alone does not). */
export const isFiltered = (f: MarketFilters) => Boolean(f.q?.trim() || f.category || f.brand || f.check);

/* ------------------------------------------- URL state ------------------------------------------- */

export interface MarketState extends MarketFilters {
  q: string;
  sort: CouponSort;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pick = <T extends string>(v: string, allowed: readonly T[]): T | undefined => ((allowed as readonly string[]).includes(v) ? (v as T) : undefined);

/**
 * Reads the page state from query values. Anything unknown or malformed is dropped (never echoed): the category must
 * be one the list has, the brand a slug of a listed coupon, the query is cut to 80 characters.
 */
export function parseMarketState(get: (key: string) => string, m: Market): MarketState {
  const s = (k: string, max = 80) => get(k).slice(0, max).trim();
  const category = m.categories.some((c) => c.slug === s("category", 40)) ? s("category", 40) : undefined;
  const brandSlug = s("brand");
  const brand = SLUG.test(brandSlug) && m.coupons.some((k) => k.brandSlug === brandSlug) ? brandSlug : undefined;
  return {
    q: get("q").slice(0, MAX_QUERY),
    category,
    brand,
    check: pick(s("check", 20), COUPON_STATUSES),
    sort: pick(s("sort", 10), COUPON_SORTS) ?? "verified",
  };
}

/** Query string for a state; defaults are left out so the plain page stays /deals/. */
export function marketQuery(st: MarketState): string {
  const q = new URLSearchParams();
  if (st.q.trim()) q.set("q", st.q.trim());
  if (st.category) q.set("category", st.category);
  if (st.brand) q.set("brand", st.brand);
  if (st.check) q.set("check", st.check);
  if (st.sort !== "verified") q.set("sort", st.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}
