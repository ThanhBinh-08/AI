/**
 * Normalised models the UI consumes. They never carry Sheet column names, and every URL in them has been
 * validated. `affiliate_url` itself is never sent to pages: CTAs link to /go/<brandId>/.
 */

export type BrandStatus = "published" | "draft" | "pending" | "archived";
export type ProgramStatus = "approved" | "pending" | "paused" | "rejected";
export type CouponStatus = "published" | "draft" | "expired" | "invalid";
export type Verification = "unverified" | "source_verified" | "checkout_tested";
export type ContentType = "blog" | "compare" | "alternatives";
export type BlogKind = "review" | "guide" | "comparison";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string;
  categories: string[];
  domain: string | null;
  status: BrandStatus;
  programStatus: ProgramStatus;
  /** True when /go/<id>/ will redirect: published, program approved and a valid, allowed affiliate URL. */
  hasAffiliate: boolean;
  /** Sample record (publish_status=preview): shown only on non-indexable deployments, labelled as sample data. */
  preview?: boolean;
  /** Editorially featured (Tools.featured = TRUE): its deals lead the Deals page. */
  featured?: boolean;
  /** A fictional record made to test the layout (not a real product). Implies preview. */
  sample?: boolean;
  updatedAt: string | null;
}

/** Where a tool's listing data came from. Shown as a reference, never as our own finding. */
export interface ListingSource {
  name: string;
  /** https URL of the source page, when there is one. */
  url: string | null;
}

export interface Coupon {
  id: string;
  slug: string;
  brandId: string;
  code: string | null;
  discount: string;
  title: string;
  terms: string;
  /** YYYY-MM-DD, inclusive. */
  expiresAt: string | null;
  /** Hostname of the reference the code was taken from (never a link target). */
  sourceHost: string | null;
  verification: Verification;
  verifiedAt: string | null;
  status: CouponStatus;
}

export interface Product {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  categories: string[];
  pricing: string;
  pricingCheckedAt: string | null;
  pricingSourceHost: string | null;
  features: string[];
  useCases: string[];
  pros: string[];
  cons: string[];
  status: BrandStatus;
  /** Supported platforms; filled only for verified tools. */
  platforms: string[];
  /** True when someone checked the record (Tools.verification_status = verified). Sample data is never verified. */
  verified: boolean;
  /** Day of that check. */
  verifiedAt: string | null;
  listingSource: ListingSource | null;
  /** The tool's own site (https), for a plain reference link. Never an affiliate link. */
  officialUrl: string | null;
}

export interface Post {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  author: string | null;
  brandId: string | null;
  productId: string | null;
  productIds: string[];
  status: "published" | "draft";
  /** From Blog_Posts.post_type; posts without it are told apart by having a product (review) or not (guide). */
  kind?: BlogKind;
}

/** A blog post with what the Blog pages need: its kind, reading time and the tool it is about. */
export interface PostView extends Post {
  kind: BlogKind;
  readingMinutes: number;
  /** The tool the post is about (Blog_Posts.tool_id). Its logo always comes from that tool's Tools.logo_url. */
  tool: { id: string; name: string; slug: string; logoUrl: string | null; categories: string[]; verified: boolean; listingSource: ListingSource | null } | null;
  /** Categories of the tool (empty for guides). */
  categories: string[];
  /**
   * A "review" built from directory/listing data about a tool nobody has checked: shown as a Tool profile,
   * never called a review, and kept out of search engines.
   */
  directoryProfile: boolean;
  /** Original, finished content that may be indexed and listed in the sitemap and feed. */
  indexable: boolean;
}

/** A problem found while reading the Sheet. Logged and shown on /api/health; never shown to visitors. */
export interface Issue {
  tab: string;
  row: number;
  message: string;
}

export interface Catalog {
  brands: Brand[];
  coupons: Coupon[];
  products: Product[];
  posts: Post[];
  issues: Issue[];
}

/** A coupon with what the UI needs to render it. */
export interface DealView extends Coupon {
  brand: Brand;
  active: boolean;
}
