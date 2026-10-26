/**
 * Normalized AI-directory database layout (8 tabs). Shared by the Sheet creation/import scripts and by the
 * adapter that feeds the site. No server-only code here.
 */

export const NORMALIZED_TABS = [
  "Settings",
  "Categories",
  "Tools",
  "Tool_Categories",
  "Tool_Alternatives",
  "Deals",
  "Blog_Posts",
  "Import_Log",
] as const;

export type NormalizedTab = (typeof NORMALIZED_TABS)[number];

export const HEADERS: Record<NormalizedTab, readonly string[]> = {
  Settings: ["setting_key", "setting_value", "description", "updated_at"],
  Categories: [
    "category_id", "category_name", "slug", "description", "parent_category_id", "display_order", "status", "created_at", "updated_at",
  ],
  Tools: [
    "tool_id", "name", "slug", "short_description", "description", "logo_url", "official_url", "affiliate_url",
    "pricing_model", "pricing_details", "launch_date", "source_name", "source_url", "imported_at", "data_source_type",
    "verification_status", "publish_status", "featured", "display_order", "created_at", "updated_at",
  ],
  Tool_Categories: ["tool_category_id", "tool_id", "category_id", "is_primary", "created_at"],
  Tool_Alternatives: ["alternative_id", "tool_id", "alternative_tool_id", "relationship_type", "display_order", "created_at"],
  Deals: [
    "deal_id", "tool_id", "title", "coupon_code", "discount", "affiliate_url", "starts_at", "expires_at",
    "verification_status", "publish_status", "source_url", "created_at", "updated_at", "is_featured", "featured_order",
  ],
  Blog_Posts: [
    "post_id", "title", "slug", "excerpt", "content", "author", "published_at", "updated_at", "status", "seo_title", "seo_description",
    "source_url", "post_type", "tool_id",
  ],
  Import_Log: [
    "import_id", "source_name", "started_at", "completed_at", "records_discovered", "records_inserted", "records_skipped",
    "records_failed", "status", "report_location", "notes",
  ],
};

export const PRIMARY_KEYS: Record<NormalizedTab, string> = {
  Settings: "setting_key",
  Categories: "category_id",
  Tools: "tool_id",
  Tool_Categories: "tool_category_id",
  Tool_Alternatives: "alternative_id",
  Deals: "deal_id",
  Blog_Posts: "post_id",
  Import_Log: "import_id",
};

/**
 * Columns a Sheet may leave out; a missing one reads as empty. Three kinds:
 * - added after the first release (Blog_Posts source_url/post_type/tool_id, Deals is_featured/featured_order);
 * - removed from the live Sheet on 2026-10-26: Tools.official_url (its URLs moved to Tools.affiliate_url, the one
 *   link column), Tools.description/created_at/updated_at, and the Deals columns other than
 *   deal_id/tool_id/title/coupon_code/discount/expires_at.
 * Every other column of HEADERS is required: without it the tab is ignored and reported.
 */
export const OPTIONAL_HEADERS: Partial<Record<NormalizedTab, readonly string[]>> = {
  Blog_Posts: ["source_url", "post_type", "tool_id"],
  Tools: ["description", "official_url", "created_at", "updated_at"],
  Deals: ["affiliate_url", "starts_at", "verification_status", "publish_status", "source_url", "created_at", "updated_at", "is_featured", "featured_order"],
};

/** Tabs a Sheet may leave out (read as empty). The live Sheet removed both on 2026-10-26. */
export const OPTIONAL_TABS: readonly NormalizedTab[] = ["Tool_Alternatives", "Import_Log"];

/**
 * Editorial columns a Tools row MAY have, added by hand at the end of the tab when someone has checked the tool
 * (list cells: one item per line or separated by "|"). They are not part of HEADERS, so the import scripts never
 * create or fill them, and the site shows them only when the row's verification_status is "verified".
 */
export const TOOL_EDITORIAL_COLUMNS = ["features", "use_cases", "platforms", "pros", "cons"] as const;

/** Foreign keys: [tab, column] → referenced [tab, column]. */
export const FOREIGN_KEYS: readonly { from: [NormalizedTab, string]; to: [NormalizedTab, string]; nullable: boolean }[] = [
  { from: ["Categories", "parent_category_id"], to: ["Categories", "category_id"], nullable: true },
  { from: ["Tool_Categories", "tool_id"], to: ["Tools", "tool_id"], nullable: false },
  { from: ["Tool_Categories", "category_id"], to: ["Categories", "category_id"], nullable: false },
  { from: ["Tool_Alternatives", "tool_id"], to: ["Tools", "tool_id"], nullable: false },
  { from: ["Tool_Alternatives", "alternative_tool_id"], to: ["Tools", "tool_id"], nullable: false },
  { from: ["Deals", "tool_id"], to: ["Tools", "tool_id"], nullable: false },
  // A review is about one tool; guides and comparisons may leave it empty.
  { from: ["Blog_Posts", "tool_id"], to: ["Tools", "tool_id"], nullable: true },
  // Natural key: a post may name its tool by the tool's source_url instead (or as well, then both must agree).
  { from: ["Blog_Posts", "source_url"], to: ["Tools", "source_url"], nullable: true },
];

/** Columns that must be unique besides the primary key. */
export const UNIQUE_COLUMNS: readonly [NormalizedTab, string][] = [
  ["Categories", "slug"],
  ["Tools", "slug"],
  ["Blog_Posts", "slug"],
];

/** Columns that must be unique when filled (a Tools.source_url identifies one tool; Blog_Posts points at it). */
export const UNIQUE_WHEN_PRESENT: readonly [NormalizedTab, string][] = [["Tools", "source_url"]];

/** Controlled values; the creation script turns these into Sheet dropdowns. */
export const ENUMS: Partial<Record<NormalizedTab, Record<string, readonly string[]>>> = {
  Categories: { status: ["active", "hidden", "archived"] },
  Tools: {
    pricing_model: ["free", "freemium", "paid", "usage_based", "contact_for_pricing", "unknown"],
    data_source_type: ["preview_import", "manually_entered", "verified_external"],
    verification_status: ["unverified", "pending_review", "verified"],
    publish_status: ["draft", "preview", "published", "archived"],
    featured: ["TRUE", "FALSE"],
  },
  Tool_Categories: { is_primary: ["TRUE", "FALSE"] },
  Tool_Alternatives: { relationship_type: ["alternative", "competitor", "similar"] },
  Deals: {
    verification_status: ["unverified", "pending_review", "verified"],
    publish_status: ["draft", "preview", "published", "archived"],
  },
  Blog_Posts: { status: ["draft", "published", "archived"], post_type: ["review", "guide", "comparison"] },
  Import_Log: { status: ["dry_run", "running", "completed", "completed_with_errors", "failed"] },
};

/**
 * Stable category ids → slug used by the site (src/config/categories.ts). The site's fixed taxonomy is the
 * source of truth, so the Categories tab is seeded from it rather than from a second, competing list.
 */
export const CATEGORY_SEED: readonly { id: string; name: string; slug: string; description: string }[] = [
  { id: "CAT001", name: "AI Writing", slug: "ai-writing", description: "Tools that draft, rewrite, summarize or check text: copy, articles, emails and documentation." },
  { id: "CAT002", name: "AI Image Generation", slug: "ai-image", description: "Tools that create or edit images from text prompts or reference pictures." },
  { id: "CAT003", name: "AI Video", slug: "ai-video", description: "Tools that generate, edit, caption or dub video." },
  { id: "CAT004", name: "AI Coding", slug: "ai-coding", description: "Assistants and agents that write, review, explain or test code." },
  { id: "CAT005", name: "AI Audio", slug: "ai-audio", description: "Voice generation, transcription, music and audio clean-up tools." },
  { id: "CAT006", name: "Productivity", slug: "productivity", description: "Note-taking, meeting, research and task tools that use AI to save time." },
  { id: "CAT007", name: "Marketing", slug: "marketing", description: "SEO, social media, advertising and email tools with AI features." },
  { id: "CAT008", name: "Business", slug: "business", description: "Sales, support, finance and operations software for teams." },
  { id: "CAT009", name: "Design", slug: "design", description: "Design, presentation and brand tools that use AI to speed up visual work." },
  { id: "CAT010", name: "Automation", slug: "automation", description: "Workflow, agent and integration tools that connect apps and run tasks for you." },
];

export const SETTINGS_SEED: readonly { key: string; value: string; description: string }[] = [
  { key: "site_name", value: "AI Tools & Deals", description: "Display name; the site reads NEXT_PUBLIC_SITE_NAME, this is informational." },
  { key: "default_language", value: "en-US", description: "Content language." },
  { key: "default_currency", value: "USD", description: "Currency for prices and discounts." },
  { key: "data_attribution", value: "AI tool rankings from AI Use Cases (https://aiusecases.dev), 2026, CC BY 4.0", description: "Required credit for tool records imported from aiusecases.dev. Keep it while those records are used." },
  { key: "preview_mode", value: "TRUE", description: "TRUE on the preview spreadsheet: rows with publish_status=preview are sample data. Production sheet: FALSE." },
];

export const isTab = (name: string): name is NormalizedTab => (NORMALIZED_TABS as readonly string[]).includes(name);
