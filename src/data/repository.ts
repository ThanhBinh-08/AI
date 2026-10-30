import "server-only";
import { CATEGORIES, categoryBySlug, type CategoryDef } from "@/config/categories";
import { PAGE_SIZE } from "@/config/site";
import { ARTICLES } from "@/content/articles";
import { getParsedCatalog } from "@/data/store";
import { siteLogoPath } from "@/lib/logo-path";
import { goHref } from "@/lib/go";
import { buildMarket, type Market } from "@/lib/market";
import { isCheckedVerification, isLiveCoupon } from "@/lib/coupon-rules";
import { FEATURED_LIMIT, selectFeatured, type FeaturedContext } from "@/lib/featured";
import type { BlogKind, Brand, Catalog, Coupon, DealView, Post, PostView, Product, Verification } from "@/types/catalog";

export { forceRefresh, storeHealth } from "@/data/store";
export { isUnavailable } from "@/data/sheets/errors";

/* ------------------------------------------------------------------------------------------------
 * Visibility rules (one place):
 * - a brand is public when status = published;
 * - a product is public when it and its brand are published;
 * - a deal is listed when status = published, its brand is public and it has not expired;
 *   an expired deal keeps its page (noindex, no code, link to the brand) but is never listed;
 * - a comparison needs 2+ public products, an alternatives page a public subject and 1+ public alternative.
 * ---------------------------------------------------------------------------------------------- */

async function catalog(): Promise<Catalog> {
  return (await getParsedCatalog()).catalog;
}

const isPublicBrand = (b: Brand | undefined): b is Brand => b?.status === "published";

export function isActiveDeal(c: Coupon, now: Date = new Date()): boolean {
  return isLiveCoupon(c, now);
}

function brandMap(c: Catalog): Map<string, Brand> {
  return new Map(c.brands.filter(isPublicBrand).map((b) => [b.id, b]));
}

function toDeal(coupon: Coupon, brand: Brand, now = new Date()): DealView {
  return { ...coupon, brand, active: isActiveDeal(coupon, now) };
}

/** Every published, unexpired deal of a public brand, checked or not. Only used where unchecked ones are counted. */
function liveDeals(c: Catalog): DealView[] {
  const brands = brandMap(c);
  const now = new Date();
  return c.coupons.flatMap((x) => {
    const b = brands.get(x.brandId);
    return b && isActiveDeal(x, now) ? [toDeal(x, b, now)] : [];
  });
}

/** A deal someone has checked (source or checkout). Unchecked offers are never promoted. */
export const isPromotable = (d: Pick<DealView, "verification" | "active">) => d.active && isCheckedVerification(d.verification);

/**
 * The deals the site promotes: live AND checked. Every list, count, card badge, featured slot, search result and the
 * sitemap uses this, so an unchecked code is never shown as an active promotion. Its own page stays reachable (noindex).
 */
function activeDeals(c: Catalog): DealView[] {
  return liveDeals(c).filter(isPromotable);
}

function publicProducts(c: Catalog): (Product & { brand: Brand })[] {
  const brands = brandMap(c);
  return c.products.flatMap((p) => {
    const b = brands.get(p.brandId);
    return b && p.status === "published" ? [{ ...p, brand: b }] : [];
  });
}

/** Categories of a deal: the brand's. */
const dealCategories = (d: DealView) => d.brand.categories;

const VERIFICATION_RANK: Record<Verification, number> = { checkout_tested: 2, source_verified: 1, unverified: 0 };

export type DealSort = "verified" | "ending" | "brand";

export interface DealFilters {
  category?: string;
  brand?: string;
  verification?: Verification | "checked";
  sort?: DealSort;
  page?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

function paginate<T>(all: T[], page = 1, size = PAGE_SIZE): Paged<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  return { items: all.slice((p - 1) * size, p * size), total: all.length, page: p, totalPages };
}

function sortDeals(deals: DealView[], sort: DealSort = "verified"): DealView[] {
  const list = [...deals];
  if (sort === "brand") return list.sort((a, b) => a.brand.name.localeCompare(b.brand.name) || a.discount.localeCompare(b.discount));
  if (sort === "ending") return list.sort((a, b) => (a.expiresAt ?? "9999") .localeCompare(b.expiresAt ?? "9999"));
  return list.sort(
    (a, b) =>
      VERIFICATION_RANK[b.verification] - VERIFICATION_RANK[a.verification] || (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? ""),
  );
}

/* ----------------------------------------- Deals ----------------------------------------- */

/**
 * Featured deals for one placement (rules in src/lib/featured.ts): only deals an editor marked Deals.is_featured,
 * that are live, checked and have a working /go/ link, in featured_order (then deal_id). With a context, deals of
 * those brands or categories come first, minus the ones the page already shows. Never padded with other deals.
 */
export async function listFeaturedDeals(ctx: FeaturedContext = {}): Promise<DealView[]> {
  // Every placement shows a full set when enough featured deals exist: relevant ones first, then the others.
  return selectFeatured(liveDeals(await catalog()), { fill: true, ...ctx });
}

/** Categories that have active deals, with the count, for the filter chips. */
export async function dealCategoryCounts(): Promise<{ slug: string; name: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const d of activeDeals(await catalog())) for (const c of dealCategories(d)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return CATEGORIES.filter((c) => counts.has(c.slug)).map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.slug)! }));
}

export async function listDeals(f: DealFilters = {}): Promise<Paged<DealView>> {
  let deals = activeDeals(await catalog());
  if (f.category) deals = deals.filter((d) => dealCategories(d).includes(f.category!));
  if (f.brand) deals = deals.filter((d) => d.brand.slug === f.brand);
  if (f.verification === "checked") deals = deals.filter((d) => d.verification !== "unverified");
  else if (f.verification) deals = deals.filter((d) => d.verification === f.verification);
  return paginate(sortDeals(deals, f.sort), f.page);
}

/** Filter choices that have at least one active deal. */
export async function dealFacets(): Promise<{ categories: CategoryDef[]; brands: { slug: string; name: string }[] }> {
  const deals = activeDeals(await catalog());
  const cats = new Set(deals.flatMap(dealCategories));
  const brands = new Map(deals.map((d) => [d.brand.slug, d.brand.name]));
  return {
    categories: CATEGORIES.filter((c) => cats.has(c.slug)),
    brands: [...brands].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Everything the Deals page needs, built once from the cached catalog: every listed brand, every eligible coupon and
 * the category counts. Search, filters and sorting then run on this data in the browser, never against the Sheet.
 */
export async function getDealsMarket(now: Date = new Date()): Promise<Market> {
  return buildMarket(await catalog(), now);
}

export interface DealPage {
  deal: DealView;
  related: DealView[];
}

/** A deal page: active or expired, of a public brand. Drafts and invalid deals are 404. */
export async function getDeal(slug: string): Promise<DealPage | null> {
  const c = await catalog();
  const brands = brandMap(c);
  const coupon = c.coupons.find((x) => x.slug === slug);
  const brand = coupon ? brands.get(coupon.brandId) : undefined;
  if (!coupon || !brand) return null;
  const deal = toDeal(coupon, brand);
  const others = activeDeals(c).filter((d) => d.id !== coupon.id);
  const sameBrand = others.filter((d) => d.brandId === brand.id);
  const sameCategory = others.filter((d) => d.brandId !== brand.id && d.brand.categories.some((cat) => brand.categories.includes(cat)));
  return { deal, related: [...sameBrand, ...sameCategory].slice(0, 4) };
}

/** What the code popup of a deal needs. Fetched on demand, so the code never travels in the HTML of a list. */
export interface DealReveal {
  slug: string;
  title: string;
  brandName: string;
  discount: string;
  code: string | null;
  terms: string;
  expiresAt: string | null;
  /** /go/<brandId>/ for the "Continue to store" fallback, or null without an approved link. */
  goHref: string | null;
}

/** The popup data of a promotable deal (live and checked); anything else is null, like an unknown slug. */
export async function getDealReveal(slug: string): Promise<DealReveal | null> {
  const c = await catalog();
  const coupon = c.coupons.find((x) => x.slug === slug);
  const brand = coupon ? brandMap(c).get(coupon.brandId) : undefined;
  if (!coupon || !brand) return null;
  const deal = toDeal(coupon, brand);
  if (!isPromotable(deal)) return null;
  return {
    slug: deal.slug,
    title: deal.title,
    brandName: brand.name,
    discount: deal.discount,
    code: deal.code,
    terms: deal.terms,
    expiresAt: deal.expiresAt,
    goHref: brand.hasAffiliate ? goHref(brand.id, { offer: deal.id, from: "deal-page" }) : null,
  };
}

/* ----------------------------------------- Brands ----------------------------------------- */

export interface BrandSummary extends Brand {
  activeDeals: number;
  tools: number;
}

export async function listBrands(): Promise<BrandSummary[]> {
  const c = await catalog();
  const deals = activeDeals(c);
  const products = publicProducts(c);
  return c.brands
    .filter(isPublicBrand)
    .map((b) => ({ ...b, activeDeals: deals.filter((d) => d.brandId === b.id).length, tools: products.filter((p) => p.brandId === b.id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface BrandPage {
  brand: Brand;
  deals: DealView[];
  expired: DealView[];
  tools: Product[];
  comparisons: Post[];
}

export async function getBrand(slug: string): Promise<BrandPage | null> {
  const c = await catalog();
  const brand = c.brands.find((b) => b.slug === slug);
  if (!isPublicBrand(brand)) return null;
  const now = new Date();
  const own = c.coupons.filter((x) => x.brandId === brand.id && (x.status === "published" || x.status === "expired"));
  const tools = publicProducts(c).filter((p) => p.brandId === brand.id);
  const toolIds = new Set(tools.map((t) => t.id));
  const comparisons = (await publishedComparisons(c)).filter((p) => p.productIds.some((id) => toolIds.has(id)) || toolIds.has(p.productId ?? ""));
  return {
    brand,
    deals: sortDeals(own.filter((x) => isActiveDeal(x, now)).map((x) => toDeal(x, brand, now)).filter(isPromotable)),
    expired: own.filter((x) => !isActiveDeal(x, now)).map((x) => toDeal(x, brand, now)).slice(0, 10),
    tools,
    comparisons,
  };
}

/* ----------------------------------------- Tools ----------------------------------------- */

/** A tool page with nothing beyond a description is kept out of search results until it has content. */
export function isThinTool(p: Product): boolean {
  return p.features.length + p.useCases.length + p.pros.length + p.cons.length === 0 && !p.pricing;
}

/** A tool page may be indexed only when the record was checked, is not sample data and has real content. */
export function isIndexableTool(p: Product & { brand: Brand }): boolean {
  return p.verified && !p.brand.preview && !isThinTool(p);
}

/** The logo of a tool, from its own Tools row (tool_id): the one source for every logo shown for that tool. */
export function toolLogo(p: Product & { brand: Brand }): string | null {
  return p.imageUrl ?? p.brand.logoUrl;
}

/** Deals someone has checked (source or checkout). Unchecked offers are never presented as verified deals. */
const isChecked = (d: DealView) => isPromotable(d);

export type ToolView = Product & { brand: Brand; activeDeals: number };

/** Tools for the directory page: filtered like listTools, paged. */
export async function listToolsPaged(f: { category?: string; q?: string; page?: number } = {}): Promise<Paged<ToolView>> {
  return paginate(await listTools(f), f.page);
}

/** Categories with at least one public tool, with the count, for the filter chips. */
export async function toolCategoryCounts(): Promise<{ slug: string; name: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const t of publicProducts(await catalog())) for (const c of t.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  return CATEGORIES.filter((c) => counts.has(c.slug)).map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.slug)! }));
}

export async function listTools(f: { category?: string; q?: string } = {}): Promise<ToolView[]> {
  const c = await catalog();
  const deals = activeDeals(c);
  let tools = publicProducts(c);
  if (f.category) tools = tools.filter((t) => t.categories.includes(f.category!));
  if (f.q) {
    const terms = tokens(f.q);
    tools = tools.filter((t) => matches(`${t.name} ${t.brand.name} ${t.description} ${t.categories.join(" ")}`, terms));
  }
  return tools.map((t) => ({ ...t, activeDeals: deals.filter((d) => d.brandId === t.brandId).length }));
}

export async function toolCategories(): Promise<CategoryDef[]> {
  const used = new Set(publicProducts(await catalog()).flatMap((t) => t.categories));
  return CATEGORIES.filter((c) => used.has(c.slug));
}

export interface ToolPage {
  tool: Product & { brand: Brand };
  /** Active deals of this tool that were checked. */
  deals: DealView[];
  /** Active deals of this tool that nobody has checked yet (not shown as deals on the tool page). */
  uncheckedDeals: number;
  related: ToolView[];
  /** Checked active deals of the similar tools. */
  relatedDeals: DealView[];
  comparisons: Post[];
  alternatives: Post | null;
}

export async function getTool(slug: string): Promise<ToolPage | null> {
  const c = await catalog();
  const all = publicProducts(c);
  const tool = all.find((t) => t.slug === slug);
  if (!tool) return null;
  const own = sortDeals(liveDeals(c).filter((d) => d.brandId === tool.brandId));
  const deals = own.filter(isChecked);
  // Similar = same category; checked tools first, sample data only beside other sample data.
  const related = (await listTools())
    .filter((t) => t.id !== tool.id && t.categories.some((cat) => tool.categories.includes(cat)))
    .filter((t) => Boolean(t.brand.sample) === Boolean(tool.brand.sample))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.activeDeals - a.activeDeals || Number(Boolean(toolLogo(b))) - Number(Boolean(toolLogo(a))))
    .slice(0, 3);
  const relatedIds = new Set(related.map((t) => t.brandId));
  const relatedDeals = sortDeals(activeDeals(c).filter((d) => relatedIds.has(d.brandId) && isChecked(d))).slice(0, 3);
  const comparisons = (await publishedComparisons(c)).filter((p) => p.productIds.includes(tool.id));
  const alternatives = (await publishedAlternatives(c)).find((p) => p.productId === tool.id) ?? null;
  return { tool, deals, uncheckedDeals: own.length - deals.length, related, relatedDeals, comparisons, alternatives };
}

/* --------------------------------------- Categories --------------------------------------- */

export interface CategorySummary extends CategoryDef {
  deals: number;
  tools: number;
  brands: number;
}

/** Only categories with at least one public brand, tool or active deal. */
export async function listCategories(): Promise<CategorySummary[]> {
  const c = await catalog();
  const deals = activeDeals(c);
  const tools = publicProducts(c);
  const brands = c.brands.filter(isPublicBrand);
  return CATEGORIES.map((def) => ({
    ...def,
    deals: deals.filter((d) => dealCategories(d).includes(def.slug)).length,
    tools: tools.filter((t) => t.categories.includes(def.slug)).length,
    brands: brands.filter((b) => b.categories.includes(def.slug)).length,
  })).filter((x) => x.deals + x.tools + x.brands > 0);
}

export interface CategoryPage {
  category: CategoryDef;
  deals: DealView[];
  tools: ToolView[];
  brands: Brand[];
}

export async function getCategory(slug: string): Promise<CategoryPage | null> {
  const def = categoryBySlug(slug);
  if (!def) return null;
  const c = await catalog();
  const deals = sortDeals(activeDeals(c).filter((d) => dealCategories(d).includes(slug)));
  const tools = await listTools({ category: slug });
  const brands = c.brands.filter((b) => isPublicBrand(b) && b.categories.includes(slug));
  if (deals.length + tools.length + brands.length === 0) return null;
  return { category: def, deals, tools, brands };
}

/* ------------------------------------- Posts and guides ------------------------------------- */

function sheetPosts(c: Catalog, type: Post["type"]): Post[] {
  return c.posts.filter((p) => p.type === type && p.status === "published");
}

const byDateDesc = (a: Post, b: Post) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");

/** Blog posts from the Sheet and the guides in src/content; a Sheet post with the same slug replaces a guide. */
export async function listPosts(): Promise<Post[]> {
  const fromSheet = sheetPosts(await catalog(), "blog");
  const slugs = new Set(fromSheet.map((p) => p.slug));
  return [...fromSheet, ...ARTICLES.filter((a) => !slugs.has(a.slug))].sort(byDateDesc);
}

/* ----------------------------------------- Blog views ----------------------------------------- */

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Below this many words a post is too thin to be indexed on its own. */
export const MIN_INDEXABLE_WORDS = 300;

/** Sections of a directory profile that only restate the listing source's ranking signals (scores, mentions, rank). */
const SIGNAL_SECTION = /^(public signals|signals|ranking|evidence)\b/i;

/** Removes "## <signals…>" sections (up to the next H2) from a directory profile; the rest of the text is kept. */
export function withoutSignalSections(md: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of md.split(/\r?\n/)) {
    const h2 = /^##\s+(.+)$/.exec(line.trim());
    if (h2) skipping = SIGNAL_SECTION.test(h2[1]!.replace(/[*`]/g, "").trim());
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** "Aider review" → "Aider profile": a directory profile is never called a review. */
const asProfile = (s: string) => s.replace(/\breviews?\b/gi, (w) => (w[0] === "R" ? "Profile" : "profile"));

/** A byline is shown (and given to search engines) only when it names a real author or the site; never sample text. */
const isSampleAuthor = (a: string | null) => Boolean(a && /\b(sample|fictional|placeholder)\b/i.test(a));

/**
 * Posts with kind, reading time (about 220 words a minute), the tool they are about (by tool_id) and whether they
 * may be indexed. A "review" of a tool nobody has checked is a directory profile: relabelled, never indexed.
 */
async function postViews(): Promise<PostView[]> {
  const tools = new Map((await listTools()).map((t) => [t.id, t]));
  return (await listPosts()).map((p) => {
    const t = p.productId ? tools.get(p.productId) : undefined;
    const kind = p.kind ?? (p.productId ? "review" : "guide");
    const directoryProfile = kind === "review" && (!t || !t.verified);
    const body = directoryProfile ? withoutSignalSections(p.body).replace(/\bThis review\b/g, "This profile") : p.body;
    const sample = isSampleAuthor(p.author) || Boolean(t?.brand.preview);
    return {
      ...p,
      title: directoryProfile ? asProfile(p.title) : p.title,
      seoTitle: directoryProfile && p.seoTitle ? asProfile(p.seoTitle) : p.seoTitle,
      author: isSampleAuthor(p.author) ? null : p.author,
      body,
      kind,
      readingMinutes: Math.max(1, Math.round(wordCount(body) / 220)),
      tool: t ? { id: t.id, name: t.name, slug: t.slug, logoUrl: toolLogo(t), categories: t.categories, verified: t.verified, listingSource: t.listingSource } : null,
      categories: t?.categories ?? [],
      directoryProfile,
      indexable: !directoryProfile && !sample && Boolean(p.publishedAt) && wordCount(body) >= MIN_INDEXABLE_WORDS,
    };
  });
}

/** Posts that may appear in the sitemap and feed: original, finished, not sample data. */
export async function listIndexablePosts(): Promise<PostView[]> {
  return (await postViews()).filter((p) => p.indexable);
}

export interface BlogFilters {
  kind?: BlogKind;
  category?: string;
  q?: string;
  page?: number;
}

export async function listBlog(f: BlogFilters = {}): Promise<Paged<PostView>> {
  let posts = await postViews();
  if (f.kind) posts = posts.filter((p) => p.kind === f.kind);
  if (f.category) posts = posts.filter((p) => p.categories.includes(f.category!));
  if (f.q) {
    const terms = tokens(f.q);
    posts = posts.filter((p) => matches(`${p.title} ${p.excerpt} ${p.tool?.name ?? ""}`, terms));
  }
  return paginate(posts, f.page, 12);
}

/** Counts for the Blog filters: how many posts of each kind, and in each tool category (reviews only have one). */
export async function blogFacets(): Promise<{ kinds: { kind: BlogKind; count: number }[]; categories: { slug: string; name: string; count: number }[]; total: number }> {
  const posts = await postViews();
  const kinds = (["review", "guide", "comparison"] as const).map((kind) => ({ kind, count: posts.filter((p) => p.kind === kind).length })).filter((k) => k.count > 0);
  const counts = new Map<string, number>();
  for (const p of posts) for (const c of p.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  return { kinds, categories: CATEGORIES.filter((c) => counts.has(c.slug)).map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.slug)! })), total: posts.length };
}

export interface BlogPostPage {
  post: PostView;
  tool: ToolView | null;
  deals: DealView[];
  related: PostView[];
}

/** One post with its tool, the tool's active deals and up to three related posts (same category first, then guides). */
export async function getBlogPost(slug: string): Promise<BlogPostPage | null> {
  const views = await postViews();
  const post = views.find((p) => p.slug === slug);
  if (!post) return null;
  const c = await catalog();
  const tool = post.productId ? ((await listTools()).find((t) => t.id === post.productId) ?? null) : null;
  const deals = post.brandId ? sortDeals(activeDeals(c).filter((d) => d.brandId === post.brandId && isChecked(d))).slice(0, 3) : [];
  const others = views.filter((p) => p.slug !== slug);
  const inCategory = (p: PostView) => post.categories.length > 0 && p.categories.some((x) => post.categories.includes(x));
  // Written articles first (same category, same kind, guides); directory profiles only as a last resort.
  const articles = others.filter((p) => !p.directoryProfile);
  const related = [
    ...articles.filter(inCategory),
    ...articles.filter((p) => p.kind === post.kind),
    ...articles.filter((p) => p.kind === "guide"),
    ...others.filter((p) => p.directoryProfile && inCategory(p)),
  ]
    .filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i)
    .slice(0, 3);
  return { post, tool, deals, related };
}

/** Slug of the profile/review written about a tool, for a link from the tool page. */
export async function reviewSlugForTool(productId: string): Promise<string | null> {
  return (await postViews()).find((p) => p.kind === "review" && p.productId === productId)?.slug ?? null;
}

export async function getPost(slug: string): Promise<{ post: Post; related: Post[]; deals: DealView[]; tools: ToolView[] } | null> {
  const posts = await listPosts();
  const post = posts.find((p) => p.slug === slug);
  if (!post) return null;
  const c = await catalog();
  const deals = post.brandId ? activeDeals(c).filter((d) => d.brandId === post.brandId).slice(0, 3) : [];
  const tools = (await listTools()).filter((t) => t.id === post.productId || (post.brandId !== null && t.brandId === post.brandId)).slice(0, 3);
  return { post, related: posts.filter((p) => p.slug !== slug).slice(0, 3), deals, tools };
}

async function publishedComparisons(c: Catalog): Promise<Post[]> {
  const ids = new Set(publicProducts(c).map((p) => p.id));
  return sheetPosts(c, "compare").filter((p) => p.productIds.filter((id) => ids.has(id)).length >= 2);
}

async function publishedAlternatives(c: Catalog): Promise<Post[]> {
  const ids = new Set(publicProducts(c).map((p) => p.id));
  return sheetPosts(c, "alternatives").filter((p) => p.productId !== null && ids.has(p.productId) && p.productIds.some((id) => id !== p.productId && ids.has(id)));
}

export async function listComparisons(): Promise<Post[]> {
  return (await publishedComparisons(await catalog())).sort(byDateDesc);
}

export async function listAlternatives(): Promise<(Post & { subject: string })[]> {
  const c = await catalog();
  const products = new Map(publicProducts(c).map((p) => [p.id, p]));
  return (await publishedAlternatives(c)).sort(byDateDesc).map((p) => ({ ...p, subject: products.get(p.productId!)!.name }));
}

export interface ComparePage {
  post: Post;
  tools: ToolView[];
  deals: DealView[];
}

export async function getComparison(slug: string): Promise<ComparePage | null> {
  const c = await catalog();
  const post = (await publishedComparisons(c)).find((p) => p.slug === slug);
  if (!post) return null;
  const all = await listTools();
  const tools = post.productIds.flatMap((id) => all.filter((t) => t.id === id));
  const brandIds = new Set(tools.map((t) => t.brandId));
  return { post, tools, deals: sortDeals(activeDeals(c).filter((d) => brandIds.has(d.brandId))).slice(0, 6) };
}

export interface AlternativesPage {
  post: Post;
  subject: ToolView;
  alternatives: ToolView[];
  deals: DealView[];
}

export async function getAlternatives(slug: string): Promise<AlternativesPage | null> {
  const c = await catalog();
  const post = (await publishedAlternatives(c)).find((p) => p.slug === slug);
  if (!post) return null;
  const all = await listTools();
  const subject = all.find((t) => t.id === post.productId)!;
  const alternatives = post.productIds.filter((id) => id !== subject.id).flatMap((id) => all.filter((t) => t.id === id));
  const brandIds = new Set(alternatives.map((t) => t.brandId));
  return { post, subject, alternatives, deals: sortDeals(activeDeals(c).filter((d) => brandIds.has(d.brandId))).slice(0, 6) };
}

/* ----------------------------------------- Search ----------------------------------------- */

export const MAX_QUERY_LENGTH = 80;

function tokens(q: string): string[] {
  return q.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9%$]+/).filter((t) => t.length > 0).slice(0, 8);
}

function matches(text: string, terms: string[]): boolean {
  const hay = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return terms.every((t) => hay.includes(t));
}

export interface SearchResults {
  query: string;
  deals: DealView[];
  tools: ToolView[];
  brands: Brand[];
  categories: CategoryDef[];
  posts: Post[];
  total: number;
}

export async function search(query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  const terms = tokens(q);
  const empty: SearchResults = { query: q, deals: [], tools: [], brands: [], categories: [], posts: [], total: 0 };
  if (terms.length === 0) return empty;
  const c = await catalog();
  const catName = (slug: string) => categoryBySlug(slug)?.name ?? "";
  const deals = activeDeals(c).filter((d) => matches(`${d.brand.name} ${d.discount} ${d.title} ${d.brand.categories.map(catName).join(" ")}`, terms)).slice(0, 20);
  const tools = (await listTools({ q })).slice(0, 20);
  const brands = c.brands.filter((b) => isPublicBrand(b) && matches(`${b.name} ${b.description} ${b.categories.map(catName).join(" ")}`, terms)).slice(0, 20);
  const live = new Set((await listCategories()).map((x) => x.slug));
  const categories = CATEGORIES.filter((x) => live.has(x.slug) && matches(`${x.name} ${x.intro}`, terms));
  const posts = (await postViews()).filter((p) => matches(`${p.title} ${p.excerpt}`, terms)).slice(0, 10);
  return { query: q, deals, tools, brands, categories, posts, total: deals.length + tools.length + brands.length + categories.length + posts.length };
}

/* ----------------------------------------- Home ----------------------------------------- */

export interface HomeData {
  stats: { deals: number; brands: number; tools: number; categories: number };
  categories: CategorySummary[];
  deals: DealView[];
  featuredDeals: DealView[];
  brands: BrandSummary[];
  tools: ToolView[];
  posts: Post[];
}

export async function getHome(): Promise<HomeData> {
  const [deals, featuredDeals, brands, tools, categories, views] = await Promise.all([
    listDeals(),
    listFeaturedDeals({ limit: FEATURED_LIMIT }),
    listBrands(),
    listTools(),
    listCategories(),
    postViews(),
  ]);
  const featuredIds = new Set(featuredDeals.map((d) => d.id));
  // Written articles lead; directory profiles fill in only when there is nothing else.
  const posts = [...views.filter((p) => !p.directoryProfile), ...views.filter((p) => p.directoryProfile)];
  return {
    stats: { deals: deals.total, brands: brands.length, tools: tools.length, categories: categories.length },
    categories,
    // A featured deal is not repeated in the list under it.
    deals: deals.items.filter((d) => !featuredIds.has(d.id)).slice(0, 6),
    featuredDeals,
    // "Popular" here means the brands with the most active deals: a fact from the data, not traffic.
    brands: [...brands].filter((b) => b.activeDeals > 0).sort((a, b) => b.activeDeals - a.activeDeals || a.name.localeCompare(b.name)).slice(0, 8),
    tools: tools.slice(0, 6),
    posts: posts.slice(0, 3),
  };
}

/* ----------------------------------------- Redirect ----------------------------------------- */

/**
 * Destination for /go/<brandId>/: the brand's one approved affiliate URL, or null. The brand must be
 * published and its program approved; the URL was validated (https, allowed host) when the Sheet was read.
 */
export async function resolveGo(brandId: string): Promise<string | null> {
  const { catalog: c, affiliateUrls } = await getParsedCatalog();
  const brand = c.brands.find((b) => b.id === brandId);
  if (!brand?.hasAffiliate) return null;
  return affiliateUrls.get(brand.id) ?? null;
}

/**
 * The website /logo/<id>/ may read a logo from: the tool's own domain (from its Tools row), only while its Sheet
 * logo_url is empty. Null for unknown ids, tools that have a logo_url, and tools without a usable site.
 */
export async function logoSiteOf(brandId: string): Promise<string | null> {
  const { catalog: c } = await getParsedCatalog();
  const brand = c.brands.find((b) => b.id === brandId);
  if (!brand?.domain || brand.logoUrl !== siteLogoPath(brand.id)) return null;
  return brand.domain;
}

/* ----------------------------------------- Sitemap ----------------------------------------- */

export interface SitemapData {
  deals: { slug: string; lastModified: string | null }[];
  brands: { slug: string; lastModified: string | null }[];
  tools: string[];
  categories: string[];
  posts: { slug: string; lastModified: string | null }[];
  comparisons: string[];
  alternatives: string[];
}

/** Every indexable detail URL. Expired deals, drafts and empty categories are left out. */
export async function sitemapData(): Promise<SitemapData> {
  const c = await catalog();
  const [brands, tools, categories, posts, comparisons, alternatives] = await Promise.all([
    listBrands(),
    listTools(),
    listCategories(),
    listIndexablePosts(),
    listComparisons(),
    listAlternatives(),
  ]);
  return {
    deals: activeDeals(c).map((d) => ({ slug: d.slug, lastModified: d.verifiedAt })),
    brands: brands.map((b) => ({ slug: b.slug, lastModified: b.updatedAt })),
    tools: tools.filter(isIndexableTool).map((t) => t.slug),
    categories: categories.map((x) => x.slug),
    posts: posts.map((p) => ({ slug: p.slug, lastModified: p.updatedAt ?? p.publishedAt })),
    comparisons: comparisons.map((p) => p.slug),
    // Alternatives pages without written criteria are noindex, so they stay out.
    alternatives: alternatives.filter((p) => p.body.trim() !== "").map((p) => p.slug),
  };
}

export async function hasComparisonsOrAlternatives(): Promise<{ compare: boolean; alternatives: boolean }> {
  const [a, b] = await Promise.all([listComparisons(), listAlternatives()]);
  return { compare: a.length > 0, alternatives: b.length > 0 };
}
