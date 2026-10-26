import { categoryBySlug } from "@/config/categories";
import { checkAffiliateUrl, extraHosts, httpsUrl, normalizeDomain } from "@/lib/affiliate";
import { isPast, parseDay, today } from "@/lib/dates";
import { logoOrSiteLogo } from "@/lib/logo-path";
import { SLUG_RE, slugify, splitList } from "@/lib/text";
import type { RawTabs, TabName } from "@/data/sheets/source";
import type {
  Brand,
  BrandStatus,
  Catalog,
  BlogKind,
  ContentType,
  Coupon,
  CouponStatus,
  Issue,
  Post,
  Product,
  ProgramStatus,
  Verification,
} from "@/types/catalog";

/** Parsed catalog plus the server-only affiliate URLs (never part of a page model). */
export interface ParsedCatalog {
  catalog: Catalog;
  affiliateUrls: Map<string, string>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type Row = { get: (col: string) => string; line: number };

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Rows of one tab keyed by header name. Returns null (and an issue) when a required column is missing. */
function rowsOf(tab: TabName, cells: string[][], required: readonly string[], issues: Issue[]): Row[] | null {
  if (cells.length === 0) return [];
  const header = (cells[0] ?? []).map(normHeader);
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    issues.push({ tab, row: 1, message: `missing column(s): ${missing.join(", ")}; tab ignored` });
    return null;
  }
  const index = new Map(header.map((h, i) => [h, i]));
  return cells
    .slice(1)
    .map((cols, i) => ({ cols, line: i + 2 }))
    .filter(({ cols }) => cols.some((c) => c.trim() !== ""))
    .map(({ cols, line }) => ({
      line,
      get: (col: string) => {
        const i = index.get(col);
        return i === undefined ? "" : (cols[i] ?? "").trim();
      },
    }));
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T | null {
  const v = (value.trim().toLowerCase().replace(/[\s-]+/g, "_") || fallback) as T;
  return allowed.includes(v) ? v : null;
}

function categoriesOf(cell: string, issue: (m: string) => void): string[] {
  const out: string[] = [];
  for (const raw of cell.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
    const slug = slugify(raw);
    if (categoryBySlug(slug)) {
      if (!out.includes(slug)) out.push(slug);
    } else issue(`unknown category "${raw}" ignored`);
  }
  return out;
}

const BRAND_STATUSES: readonly BrandStatus[] = ["published", "draft", "pending", "archived"];
const PROGRAM_STATUSES: readonly ProgramStatus[] = ["approved", "pending", "paused", "rejected"];
const COUPON_STATUSES: readonly CouponStatus[] = ["published", "draft", "expired", "invalid"];
const VERIFICATIONS: readonly Verification[] = ["unverified", "source_verified", "checkout_tested"];
const CONTENT_TYPES: readonly ContentType[] = ["blog", "compare", "alternatives"];
const BLOG_KINDS: readonly BlogKind[] = ["review", "guide", "comparison"];

function parseBrands(cells: string[][], issues: Issue[], affiliateUrls: Map<string, string>, extra: string[]): Brand[] {
  const rows = rowsOf("Brands", cells, ["brand_id", "name"], issues);
  if (!rows) return [];
  const brands: Brand[] = [];
  const slugs = new Set<string>();
  for (const r of rows) {
    const issue = (message: string) => issues.push({ tab: "Brands", row: r.line, message });
    const id = r.get("brand_id");
    const name = r.get("name");
    if (!ID_RE.test(id)) { issue("brand_id is empty or has characters other than letters, digits, - and _; row skipped"); continue; }
    if (brands.some((b) => b.id === id)) { issue(`duplicate brand_id ${id}; row skipped (the first row is used)`); continue; }
    if (!name || name.length > 80) { issue("name is empty or longer than 80 characters; row skipped"); continue; }
    const slug = r.get("slug") ? r.get("slug").toLowerCase() : slugify(name);
    if (!SLUG_RE.test(slug)) { issue(`slug "${slug}" is not valid; row skipped`); continue; }
    if (slugs.has(slug)) { issue(`duplicate slug ${slug}; row skipped`); continue; }
    const status = oneOf(r.get("status"), BRAND_STATUSES, "draft");
    if (!status) { issue(`unknown status "${r.get("status")}"; row skipped`); continue; }
    const program = oneOf(r.get("affiliate_program_status"), PROGRAM_STATUSES, "pending");
    if (!program) issue(`unknown affiliate_program_status "${r.get("affiliate_program_status")}"; treated as pending`);
    const domainCell = r.get("domain");
    const domain = domainCell ? normalizeDomain(domainCell) : null;
    if (domainCell && !domain) issue(`domain "${domainCell}" is not a public hostname; ignored`);
    const logoCell = r.get("logo_url");
    const logo = logoCell ? httpsUrl(logoCell) : null;
    if (logoCell && !logo) issue("logo_url is not a public https URL; placeholder used");

    let hasAffiliate = false;
    const affCell = r.get("affiliate_url");
    if (affCell) {
      const check = checkAffiliateUrl(affCell, domain, extra);
      if (check.ok) {
        affiliateUrls.set(id, check.url);
        hasAffiliate = status === "published" && program === "approved";
      } else issue(`${check.reason}; CTA disabled`);
    }
    const updated = r.get("updated_at");
    slugs.add(slug);
    brands.push({
      id,
      name,
      slug,
      // No logo_url: the logo of the tool's own website (served by /logo/<id>/), never another tool's.
      logoUrl: logoOrSiteLogo(logo ? logo.toString() : null, id, domain),
      description: r.get("description"),
      categories: categoriesOf(r.get("category"), issue),
      domain,
      status,
      programStatus: program ?? "pending",
      hasAffiliate,
      ...(r.get("preview") === "1" ? { preview: true } : {}),
      ...(r.get("featured") === "1" ? { featured: true } : {}),
      ...(r.get("sample") === "1" ? { sample: true } : {}),
      updatedAt: updated ? parseDay(updated) : null,
    });
  }
  return brands;
}

function parseCoupons(cells: string[][], issues: Issue[], brands: Map<string, Brand>, now: Date): Coupon[] {
  const rows = rowsOf("Coupons", cells, ["coupon_id", "brand_id", "discount"], issues);
  if (!rows) return [];
  const coupons: Coupon[] = [];
  for (const r of rows) {
    const issue = (message: string) => issues.push({ tab: "Coupons", row: r.line, message });
    const id = r.get("coupon_id");
    if (!ID_RE.test(id)) { issue("coupon_id is empty or not valid; row skipped"); continue; }
    if (coupons.some((c) => c.id === id)) { issue(`duplicate coupon_id ${id}; row skipped`); continue; }
    const brand = brands.get(r.get("brand_id"));
    if (!brand) { issue(`brand_id "${r.get("brand_id")}" is not in Brands; row skipped`); continue; }
    const discount = r.get("discount");
    if (!discount || discount.length > 60) { issue("discount is empty or longer than 60 characters; row skipped"); continue; }
    const code = r.get("code");
    if (code.length > 64 || /\s/.test(code)) { issue("code is longer than 64 characters or contains spaces; row skipped"); continue; }
    let status = oneOf(r.get("status"), COUPON_STATUSES, "draft");
    if (!status) { issue(`unknown status "${r.get("status")}"; row skipped`); continue; }
    if (status === "draft" || status === "invalid") continue;

    const expiresCell = r.get("expires_at");
    const expiresAt = expiresCell ? parseDay(expiresCell) : null;
    if (expiresCell && !expiresAt) { issue(`expires_at "${expiresCell}" is not a date (use YYYY-MM-DD); row skipped`); continue; }
    if (isPast(expiresAt, now)) status = "expired";

    let verification = oneOf(r.get("verification_status"), VERIFICATIONS, "unverified");
    if (!verification) { issue(`unknown verification_status "${r.get("verification_status")}"; treated as unverified`); verification = "unverified"; }
    const verifiedCell = r.get("verified_at");
    let verifiedAt = verifiedCell ? parseDay(verifiedCell) : null;
    if (verifiedCell && !verifiedAt) issue(`verified_at "${verifiedCell}" is not a date; ignored`);
    if (verifiedAt && verifiedAt > today(now)) { issue("verified_at is in the future; ignored"); verifiedAt = null; }
    if (verification !== "unverified" && !verifiedAt) {
      issue(`${verification} needs a verified_at date; shown as unverified`);
      verification = "unverified";
    }
    const sourceCell = r.get("source_url");
    const source = sourceCell ? httpsUrl(sourceCell) : null;
    if (sourceCell && !source) issue("source_url is not a public https URL; ignored");

    coupons.push({
      id,
      slug: `${brand.slug}-${slugify(id)}`,
      brandId: brand.id,
      code: code || null,
      discount,
      title: r.get("title") || `${discount} ${brand.name} ${code ? "code" : "deal"}`,
      terms: r.get("terms"),
      expiresAt,
      sourceHost: source ? source.hostname.replace(/^www\./, "") : null,
      verification,
      verifiedAt,
      status,
      ...(r.get("sample") === "1" ? { sample: true } : {}),
      ...(r.get("featured") === "1" ? { featured: true, featuredOrder: /^[1-9]\d{0,3}$/.test(r.get("featured_order")) ? Number(r.get("featured_order")) : null } : {}),
    });
  }
  return coupons;
}

function parseProducts(cells: string[][], issues: Issue[], brands: Map<string, Brand>): Product[] {
  const rows = rowsOf("Products", cells, ["product_id", "brand_id", "name"], issues);
  if (!rows) return [];
  const products: Product[] = [];
  const slugs = new Set<string>();
  // The 4-tab layout has no verification column: the owner types Products by hand, so its rows count as checked.
  // The normalized layout always sends one (from Tools.verification_status).
  const hasVerification = (cells[0] ?? []).map(normHeader).includes("verification");
  for (const r of rows) {
    const issue = (message: string) => issues.push({ tab: "Products", row: r.line, message });
    const id = r.get("product_id");
    if (!ID_RE.test(id)) { issue("product_id is empty or not valid; row skipped"); continue; }
    if (products.some((p) => p.id === id)) { issue(`duplicate product_id ${id}; row skipped`); continue; }
    const brand = brands.get(r.get("brand_id"));
    if (!brand) { issue(`brand_id "${r.get("brand_id")}" is not in Brands; row skipped`); continue; }
    const name = r.get("name");
    if (!name || name.length > 80) { issue("name is empty or longer than 80 characters; row skipped"); continue; }
    const slug = r.get("slug") ? r.get("slug").toLowerCase() : slugify(name);
    if (!SLUG_RE.test(slug) || slugs.has(slug)) { issue(`slug "${slug}" is not valid or is a duplicate; row skipped`); continue; }
    const status = oneOf(r.get("status"), BRAND_STATUSES, "draft");
    if (!status) { issue(`unknown status "${r.get("status")}"; row skipped`); continue; }
    const imageCell = r.get("image_url");
    const image = imageCell ? httpsUrl(imageCell) : null;
    if (imageCell && !image) issue("image_url is not a public https URL; ignored");
    const pricing = r.get("pricing");
    const checkedCell = r.get("pricing_checked_at");
    const pricingCheckedAt = checkedCell ? parseDay(checkedCell) : null;
    if (checkedCell && !pricingCheckedAt) issue(`pricing_checked_at "${checkedCell}" is not a date; ignored`);
    const priceSource = r.get("pricing_source_url") ? httpsUrl(r.get("pricing_source_url")) : null;
    const verified = hasVerification ? r.get("verification") === "verified" : true;
    const verifiedAt = verified && r.get("verified_at") ? parseDay(r.get("verified_at")) : null;
    const sourceName = r.get("source_name");
    const sourceUrl = r.get("source_url") ? httpsUrl(r.get("source_url")) : null;
    if (r.get("source_url") && !sourceUrl) issue("source_url is not a public https URL; ignored");
    const official = r.get("official_url") ? httpsUrl(r.get("official_url")) : null;
    slugs.add(slug);
    products.push({
      id,
      brandId: brand.id,
      name,
      slug,
      description: r.get("description"),
      imageUrl: image ? image.toString() : null,
      categories: categoriesOf(r.get("category"), issue),
      // Prices are shown only with the date they were checked; an undated price is not shown.
      pricing: pricing && pricingCheckedAt ? pricing : "",
      pricingCheckedAt: pricing ? pricingCheckedAt : null,
      pricingSourceHost: priceSource ? priceSource.hostname.replace(/^www\./, "") : null,
      features: splitList(r.get("features")),
      useCases: splitList(r.get("use_cases")),
      pros: splitList(r.get("pros")),
      cons: splitList(r.get("cons")),
      status,
      platforms: splitList(r.get("platforms")),
      verified,
      verifiedAt,
      listingSource: sourceName || sourceUrl ? { name: sourceName || sourceUrl!.hostname.replace(/^www\./, ""), url: sourceUrl ? sourceUrl.toString() : null } : null,
      officialUrl: official ? official.toString() : null,
    });
    if (pricing && !pricingCheckedAt) issue("pricing has no pricing_checked_at date; price hidden");
  }
  return products;
}

function parseContent(cells: string[][], issues: Issue[]): Post[] {
  const rows = rowsOf("Content", cells, ["content_id", "type", "title", "slug"], issues);
  if (!rows) return [];
  const posts: Post[] = [];
  for (const r of rows) {
    const issue = (message: string) => issues.push({ tab: "Content", row: r.line, message });
    const id = r.get("content_id");
    if (!ID_RE.test(id)) { issue("content_id is empty or not valid; row skipped"); continue; }
    if (posts.some((p) => p.id === id)) { issue(`duplicate content_id ${id}; row skipped`); continue; }
    const type = oneOf(r.get("type"), CONTENT_TYPES, "blog");
    if (!type) { issue(`unknown type "${r.get("type")}"; row skipped`); continue; }
    const slug = r.get("slug").toLowerCase();
    if (!SLUG_RE.test(slug)) { issue(`slug "${slug}" is not valid; row skipped`); continue; }
    if (posts.some((p) => p.type === type && p.slug === slug)) { issue(`duplicate ${type} slug ${slug}; row skipped`); continue; }
    const status = oneOf(r.get("status"), ["published", "draft"] as const, "draft");
    if (!status) { issue(`unknown status "${r.get("status")}"; row skipped`); continue; }
    const title = r.get("title");
    if (!title) { issue("title is empty; row skipped"); continue; }
    const pub = r.get("published_at") ? parseDay(r.get("published_at")) : null;
    const upd = r.get("updated_at") ? parseDay(r.get("updated_at")) : null;
    posts.push({
      id,
      type,
      slug,
      title,
      excerpt: r.get("excerpt"),
      body: r.get("body"),
      seoTitle: r.get("seo_title") || null,
      seoDescription: r.get("seo_description") || null,
      publishedAt: pub,
      updatedAt: upd,
      author: r.get("author") || null,
      brandId: r.get("brand_id") || null,
      productId: r.get("product_id") || null,
      productIds: r.get("product_ids").split(/[,;\s]+/).filter(Boolean),
      ...(BLOG_KINDS.includes(r.get("post_type") as BlogKind) ? { kind: r.get("post_type") as BlogKind } : {}),
      status,
    });
  }
  return posts;
}

/** Validates every tab. Bad rows are skipped and reported as issues; nothing is guessed or auto-published. */
export function parseCatalog(tabs: RawTabs, now: Date = new Date(), extra: string[] = extraHosts()): ParsedCatalog {
  const issues: Issue[] = [];
  const affiliateUrls = new Map<string, string>();
  const brands = parseBrands(tabs.Brands, issues, affiliateUrls, extra);
  const byId = new Map(brands.map((b) => [b.id, b]));
  return {
    catalog: {
      brands,
      coupons: parseCoupons(tabs.Coupons, issues, byId, now),
      products: parseProducts(tabs.Products, issues, byId),
      posts: parseContent(tabs.Content, issues),
      issues,
    },
    affiliateUrls,
  };
}
