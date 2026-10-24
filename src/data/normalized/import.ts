import { SLUG_RE, slugify } from "@/lib/text";
import { checkIntegrity, records, type NormalizedRaw } from "./adapt";
import { CATEGORY_SEED, HEADERS, type NormalizedTab } from "./schema";

/** One tool as extracted by scripts/db/crawl-toolify.ts. */
export interface CrawledInput {
  handle: string;
  name: string;
  sourceUrl: string;
  summary: string;
  officialUrl: string | null;
  categorySlug: string;
  /** Optional extras (newer sources). */
  slug?: string;
  /** All site categories, primary first. Empty = the source has no matching category (no relationship is invented). */
  categorySlugs?: string[];
  sourceName?: string;
  pricingModel?: string;
  pricingDetails?: string;
}

export interface ImportPlan {
  /** Rows to APPEND per tab (never updates, never deletes). */
  append: Partial<Record<NormalizedTab, string[][]>>;
  inserted: number;
  skipped: { handle: string; reason: string }[];
  failed: { handle: string; reason: string }[];
}

const row = (tab: NormalizedTab, values: Record<string, string>) => HEADERS[tab].map((h) => values[h] ?? "");

/**
 * Plans an idempotent preview import. A crawled tool is skipped when a Tools row with the same source_url exists
 * (re-run), or when its slug is already taken (never overwrites a manual or verified record). New rows are always
 * data_source_type=preview_import, verification_status=unverified, publish_status=preview; affiliate_url,
 * pricing, launch_date and logo stay empty because the source does not provide them as facts we may reuse.
 */
export function planImport(existing: NormalizedRaw, crawled: readonly CrawledInput[], now: Date = new Date()): ImportPlan {
  const stamp = now.toISOString();
  const tools = records(existing.Tools);
  const sourceUrls = new Set(tools.map((t) => t.source_url).filter(Boolean));
  const slugs = new Set(tools.map((t) => (t.slug ?? "").toLowerCase()));
  const categories = new Map(records(existing.Categories).map((c) => [c.slug, c.category_id]));
  for (const c of CATEGORY_SEED) if (!categories.has(c.slug)) categories.set(c.slug, c.id);
  let next = Math.max(0, ...tools.map((t) => Number(/^T(\d+)$/.exec(t.tool_id ?? "")?.[1] ?? 0))) + 1;
  let order = tools.length;

  const plan: ImportPlan = { append: { Tools: [], Tool_Categories: [], Import_Log: [] }, inserted: 0, skipped: [], failed: [] };
  for (const c of crawled) {
    if (sourceUrls.has(c.sourceUrl)) { plan.skipped.push({ handle: c.handle, reason: "already imported (same source_url)" }); continue; }
    const slug = c.slug && SLUG_RE.test(c.slug) ? c.slug : slugify(c.name);
    if (!slug) { plan.failed.push({ handle: c.handle, reason: "name does not produce a valid slug" }); continue; }
    if (slugs.has(slug)) { plan.skipped.push({ handle: c.handle, reason: `slug "${slug}" already exists; existing record kept` }); continue; }
    const wanted = c.categorySlugs ?? [c.categorySlug];
    const unknown = wanted.find((s) => !categories.has(s));
    if (unknown) { plan.failed.push({ handle: c.handle, reason: `category "${unknown}" is not in Categories` }); continue; }
    const id = `T${String(next++).padStart(4, "0")}`;
    slugs.add(slug);
    sourceUrls.add(c.sourceUrl);
    plan.append.Tools!.push(row("Tools", {
      tool_id: id, name: c.name, slug, short_description: c.summary, official_url: c.officialUrl ?? "", pricing_model: c.pricingModel ?? "unknown", pricing_details: c.pricingDetails ?? "",
      source_name: c.sourceName ?? "Toolify.ai", source_url: c.sourceUrl, imported_at: stamp, data_source_type: "preview_import",
      verification_status: "unverified", publish_status: "preview", featured: "FALSE", display_order: String(++order), created_at: stamp, updated_at: stamp,
    }));
    wanted.forEach((s, i) => {
      const categoryId = categories.get(s)!;
      plan.append.Tool_Categories!.push(row("Tool_Categories", { tool_category_id: `TC-${id}-${categoryId}`, tool_id: id, category_id: categoryId, is_primary: i === 0 ? "TRUE" : "FALSE", created_at: stamp }));
    });
    plan.inserted++;
  }
  plan.append.Import_Log!.push(row("Import_Log", {
    import_id: `IMP-${stamp.replace(/[-:.TZ]/g, "").slice(0, 14)}`, source_name: `${crawled[0]?.sourceName ?? "Toolify.ai"} (one-off preview sample)`, started_at: stamp, completed_at: stamp,
    records_discovered: String(crawled.length), records_inserted: String(plan.inserted), records_skipped: String(plan.skipped.length),
    records_failed: String(plan.failed.length), status: plan.failed.length ? "completed_with_errors" : "completed", report_location: "local-data (not committed)",
    notes: "preview_import rows: unverified, publish_status=preview, no affiliate/pricing/logo",
  }));
  return plan;
}

/** Existing rows plus the planned appends, ready for checkIntegrity. */
export function applyPlan(existing: NormalizedRaw, plan: ImportPlan): NormalizedRaw {
  const out = { ...existing };
  for (const [tab, rows] of Object.entries(plan.append) as [NormalizedTab, string[][]][]) {
    out[tab] = [...(existing[tab].length ? existing[tab] : [[...HEADERS[tab]]]), ...rows];
  }
  return out;
}

export function integrityIssues(raw: NormalizedRaw) {
  return checkIntegrity(raw).issues;
}
