/**
 * Featured deals: which offers may fill a featured slot, in what order, and which of them fit a page. Pure (no
 * server-only code), so the repository, the pages and the tests all use the same rules.
 *
 * A deal is featured only when an editor picked it (Deals.is_featured = TRUE) AND it passes every rule a promoted
 * deal already has to pass: published, live (not past its end date), checked, with a discount, of a published,
 * non-fictional brand that has a working /go/ link. Nothing is ever added to fill a slot.
 */
import { isEligibleCoupon } from "@/lib/coupon-rules";
import type { DealView } from "@/types/catalog";

/** Featured slots on every page: one lead card and two beside it. */
export const FEATURED_LIMIT = 3;
const MAX_LIMIT = 8;

export function isFeaturedEligible(d: DealView, now: Date = new Date()): boolean {
  return (
    d.featured === true &&
    !d.sample &&
    !d.brand.sample &&
    !d.brand.preview &&
    d.brand.hasAffiliate &&
    isEligibleCoupon(d, d.brand, now)
  );
}

/** featured_order when it is a positive whole number; anything else sorts after every ordered deal. */
export function featuredRank(d: Pick<DealView, "featuredOrder">): number {
  const n = d.featuredOrder;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

/** Plain code-unit comparison: the same result on every server and browser, whatever the locale. */
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** featured_order ascending; missing or equal orders fall back to deal_id ascending, so the order never shifts. */
export function orderFeatured<T extends Pick<DealView, "id" | "featuredOrder">>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => featuredRank(a) - featuredRank(b) || byId(a.id, b.id));
}

/** Two rows describing the same offer (same brand and code, or same brand, discount and title when there is no code). */
const offerKey = (d: DealView) =>
  d.code ? `${d.brandId}|code|${d.code.trim().toUpperCase()}` : `${d.brandId}|deal|${d.discount.trim().toLowerCase()}|${d.title.trim().toLowerCase()}`;

export interface FeaturedContext {
  /** Show only deals of these brands or of brands in these categories. Both empty: every featured deal. */
  brandIds?: readonly string[];
  categories?: readonly string[];
  /** Deal ids already shown elsewhere on the page. */
  exclude?: Iterable<string>;
  limit?: number;
  /**
   * Fill the remaining slots with other featured deals (still explicitly featured and eligible) after the relevant
   * ones, so a placement shows its full set whenever enough featured deals exist.
   */
  fill?: boolean;
}

/**
 * The featured deals for one placement: eligible, de-duplicated (one card per deal and per offer), relevant to the
 * page first when a context is given (then, with `fill`, the other featured deals), minus what the page already
 * shows, in featured order, at most `limit`.
 */
export function selectFeatured(deals: readonly DealView[], ctx: FeaturedContext = {}, now: Date = new Date()): DealView[] {
  const limit = Math.min(Math.max(1, Math.floor(ctx.limit ?? FEATURED_LIMIT)), MAX_LIMIT);
  const exclude = new Set(ctx.exclude ?? []);
  const brands = new Set(ctx.brandIds ?? []);
  const cats = new Set(ctx.categories ?? []);
  const scoped = brands.size > 0 || cats.size > 0;
  const relevant = (d: DealView) => !scoped || brands.has(d.brandId) || d.brand.categories.some((c) => cats.has(c));

  const seenIds = new Set<string>();
  const seenOffers = new Set<string>();
  const unique: DealView[] = [];
  for (const d of orderFeatured(deals.filter((x) => isFeaturedEligible(x, now)))) {
    const key = offerKey(d);
    if (seenIds.has(d.id) || seenOffers.has(key)) continue;
    seenIds.add(d.id);
    seenOffers.add(key);
    if (!exclude.has(d.id)) unique.push(d);
  }
  const first = unique.filter(relevant);
  const rest = ctx.fill && scoped ? unique.filter((d) => !relevant(d)) : [];
  return [...first, ...rest].slice(0, limit);
}
