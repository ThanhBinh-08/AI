import { httpsUrl } from "@/lib/affiliate";
import { parseDay } from "@/lib/dates";
import { SLUG_RE } from "@/lib/text";
import type { Issue } from "@/types/catalog";
import { emptyTabs, type RawTabs } from "@/data/sheets/source";
import { ENUMS, FOREIGN_KEYS, HEADERS, NORMALIZED_TABS, OPTIONAL_HEADERS, PRIMARY_KEYS, UNIQUE_COLUMNS, UNIQUE_WHEN_PRESENT, type NormalizedTab } from "./schema";

/** Raw cell values per normalized tab; row 0 is the header. */
export type NormalizedRaw = Record<NormalizedTab, string[][]>;

export const emptyNormalized = (): NormalizedRaw =>
  Object.fromEntries(NORMALIZED_TABS.map((t) => [t, []])) as unknown as NormalizedRaw;

type Rec = Record<string, string> & { __line: string };

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Rows as header-keyed records; unknown columns are kept, missing ones read as "". */
export function records(cells: string[][]): Rec[] {
  if (cells.length === 0) return [];
  const header = (cells[0] ?? []).map(normHeader);
  return cells
    .slice(1)
    .map((cols, i) => ({ cols, line: i + 2 }))
    .filter(({ cols }) => cols.some((c) => c.trim() !== ""))
    .map(({ cols, line }) => {
      const r: Record<string, string> = { __line: String(line) };
      header.forEach((h, i) => { r[h] = (cols[i] ?? "").trim(); });
      return r as Rec;
    });
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const bool = (v: string | undefined) => /^(true|yes|1)$/i.test((v ?? "").trim());
/** Deals.is_featured: only an explicit TRUE (a Sheets checkbox reads as TRUE) picks a deal. */
const isFeaturedFlag = (v: string | undefined) => /^true$/i.test((v ?? "").trim());
/** Deals.featured_order: 1, 2, 3... (at most 4 digits). 0, negatives, decimals and text are not an order. */
const FEATURED_ORDER_RE = /^[1-9]\d{0,3}$/;

export interface IntegrityReport {
  issues: Issue[];
  /** Per tab: line numbers (sheet rows) that must not be used. */
  rejected: Record<NormalizedTab, Set<number>>;
}

/**
 * Application-level integrity (Sheets has no constraints): header presence, non-empty and unique primary keys,
 * unique slugs, foreign keys, duplicate tool-category pairs, one primary category per tool, no self-alternatives,
 * enum values, URL syntax. A bad row is rejected and reported; nothing is repaired silently.
 */
export function checkIntegrity(raw: NormalizedRaw): IntegrityReport {
  const issues: Issue[] = [];
  const rejected = Object.fromEntries(NORMALIZED_TABS.map((t) => [t, new Set<number>()])) as Record<NormalizedTab, Set<number>>;
  const rows = Object.fromEntries(NORMALIZED_TABS.map((t) => [t, records(raw[t] ?? [])])) as Record<NormalizedTab, Rec[]>;
  const report = (tab: NormalizedTab, r: Rec, message: string, reject = true) => {
    issues.push({ tab, row: Number(r.__line), message: reject ? `${message}; row skipped` : message });
    if (reject) rejected[tab].add(Number(r.__line));
  };

  for (const tab of NORMALIZED_TABS) {
    const cells = raw[tab] ?? [];
    if (cells.length === 0) continue;
    const header = (cells[0] ?? []).map(normHeader);
    const optional = OPTIONAL_HEADERS[tab] ?? [];
    const missing = HEADERS[tab].filter((h) => !header.includes(h) && !optional.includes(h));
    if (missing.length > 0) {
      issues.push({ tab, row: 1, message: `missing column(s): ${missing.join(", ")}; tab ignored` });
      rows[tab] = [];
    }
  }

  // Primary keys
  for (const tab of NORMALIZED_TABS) {
    const pk = PRIMARY_KEYS[tab];
    const seen = new Set<string>();
    for (const r of rows[tab]) {
      const v = r[pk] ?? "";
      if (!ID_RE.test(v)) report(tab, r, `${pk} is empty or has invalid characters`);
      else if (seen.has(v)) report(tab, r, `duplicate ${pk} ${v}`);
      else seen.add(v);
    }
  }
  // Unique columns
  for (const [tab, column] of UNIQUE_COLUMNS) {
    const seen = new Set<string>();
    for (const r of rows[tab]) {
      if (rejected[tab].has(Number(r.__line))) continue;
      const v = (r[column] ?? "").toLowerCase();
      if (!v) { report(tab, r, `${column} is empty`); continue; }
      if (!SLUG_RE.test(v)) { report(tab, r, `${column} "${v}" is not a valid slug`); continue; }
      if (seen.has(v)) report(tab, r, `duplicate ${column} ${v}`);
      else seen.add(v);
    }
  }
  for (const [tab, column] of UNIQUE_WHEN_PRESENT) {
    const seen = new Set<string>();
    for (const r of rows[tab]) {
      const v = r[column] ?? "";
      if (!v || rejected[tab].has(Number(r.__line))) continue;
      if (seen.has(v)) report(tab, r, `duplicate ${column} ${v}`);
      else seen.add(v);
    }
  }
  // Required fields
  for (const r of rows.Tools) if (!rejected.Tools.has(Number(r.__line)) && !r.name) report("Tools", r, "name is empty");
  for (const r of rows.Categories) if (!rejected.Categories.has(Number(r.__line)) && !r.category_name) report("Categories", r, "category_name is empty");
  for (const r of rows.Deals) if (!rejected.Deals.has(Number(r.__line)) && !r.discount) report("Deals", r, "discount is empty");
  for (const r of rows.Blog_Posts) if (!rejected.Blog_Posts.has(Number(r.__line)) && !r.title) report("Blog_Posts", r, "title is empty");

  // Enums (empty is allowed: defaults apply)
  for (const tab of NORMALIZED_TABS) {
    for (const [column, allowed] of Object.entries(ENUMS[tab] ?? {})) {
      for (const r of rows[tab]) {
        const v = r[column] ?? "";
        if (v && !allowed.some((a) => a.toLowerCase() === v.toLowerCase())) report(tab, r, `${column} "${v}" is not one of ${allowed.join("/")}`);
      }
    }
  }
  // URLs: syntax only here; the site's parser applies the network/host rules.
  const urlColumns: [NormalizedTab, string][] = [
    ["Tools", "logo_url"], ["Tools", "official_url"], ["Tools", "affiliate_url"], ["Tools", "source_url"],
    ["Deals", "affiliate_url"], ["Deals", "source_url"],
  ];
  for (const [tab, column] of urlColumns) {
    for (const r of rows[tab]) {
      const v = r[column];
      if (v && !httpsUrl(v)) report(tab, r, `${column} is not a public https URL`);
    }
  }

  // Foreign keys
  for (const fk of FOREIGN_KEYS) {
    const [fromTab, fromCol] = fk.from;
    const [toTab, toCol] = fk.to;
    const targets = new Set(rows[toTab].filter((r) => !rejected[toTab].has(Number(r.__line))).map((r) => r[toCol]));
    for (const r of rows[fromTab]) {
      if (rejected[fromTab].has(Number(r.__line))) continue;
      const v = r[fromCol] ?? "";
      if (!v) { if (!fk.nullable) report(fromTab, r, `${fromCol} is empty`); continue; }
      if (!targets.has(v)) report(fromTab, r, `${fromCol} "${v}" does not exist in ${toTab}.${toCol}`);
    }
  }
  // Relationship rules
  const pairs = new Set<string>();
  const primary = new Map<string, number>();
  for (const r of rows.Tool_Categories) {
    if (rejected.Tool_Categories.has(Number(r.__line))) continue;
    const key = `${r.tool_id}|${r.category_id}`;
    if (pairs.has(key)) { report("Tool_Categories", r, `duplicate pair ${r.tool_id}/${r.category_id}`); continue; }
    pairs.add(key);
    if (bool(r.is_primary)) {
      const n = (primary.get(r.tool_id!) ?? 0) + 1;
      primary.set(r.tool_id!, n);
      if (n > 1) report("Tool_Categories", r, `tool ${r.tool_id} already has a primary category`);
    }
  }
  const altPairs = new Set<string>();
  for (const r of rows.Tool_Alternatives) {
    if (rejected.Tool_Alternatives.has(Number(r.__line))) continue;
    if (r.tool_id === r.alternative_tool_id) { report("Tool_Alternatives", r, "a tool cannot be its own alternative"); continue; }
    const key = `${r.tool_id}|${r.alternative_tool_id}`;
    if (altPairs.has(key)) report("Tool_Alternatives", r, `duplicate pair ${key}`);
    else altPairs.add(key);
  }
  // Posts about a tool: tool_id and/or the tool's source_url must name the same existing tool; a review needs one of
  // them, and a tool has at most one review.
  const toolBySource = new Map(rows.Tools.filter((t) => !rejected.Tools.has(Number(t.__line)) && t.source_url).map((t) => [t.source_url!, t.tool_id!]));
  const reviewOf = new Map<string, string>();
  for (const r of rows.Blog_Posts) {
    if (rejected.Blog_Posts.has(Number(r.__line))) continue;
    const bySource = r.source_url ? toolBySource.get(r.source_url) : undefined;
    if (r.tool_id && bySource && r.tool_id !== bySource) { report("Blog_Posts", r, `tool_id ${r.tool_id} and source_url point to different tools (${bySource})`); continue; }
    if ((r.post_type || "guide") !== "review") continue;
    const toolId = r.tool_id || bySource;
    if (!toolId) { report("Blog_Posts", r, "a review needs a tool_id or the source_url of an existing tool"); continue; }
    const first = reviewOf.get(toolId);
    if (first) report("Blog_Posts", r, `tool ${toolId} already has a review (${first})`);
    else reviewOf.set(toolId, r.post_id!);
  }
  // Category parent loops
  const parents = new Map(rows.Categories.filter((r) => !rejected.Categories.has(Number(r.__line))).map((r) => [r.category_id!, r.parent_category_id ?? ""]));
  for (const r of rows.Categories) {
    if (rejected.Categories.has(Number(r.__line))) continue;
    const seen = new Set<string>([r.category_id!]);
    for (let p = r.parent_category_id; p; p = parents.get(p) ?? "") {
      if (seen.has(p)) { report("Categories", r, "parent_category_id forms a loop"); break; }
      seen.add(p);
    }
  }
  return { issues, rejected };
}

export interface AdaptOptions {
  /** Show rows with publish_status=preview as published. Never true on an indexable production site. */
  allowPreview: boolean;
  now?: Date;
}

/**
 * The URL every "get link" / "visit" CTA of a tool redirects to (through /go/<tool_id>/): Tools.affiliate_url when
 * filled, otherwise Tools.official_url of the same row. Never another row's URL, never a deal-level URL.
 */
export function toolLink(t: Record<string, string | undefined>): string {
  return (t.affiliate_url ?? "").trim() || (t.official_url ?? "").trim();
}

const hostOf = (url: string): string => {
  const u = httpsUrl(url);
  return u ? u.hostname.replace(/^www\./, "") : "";
};

/**
 * Maps the normalized tabs onto the four tabs the site already parses (Brands, Coupons, Products, Content), so the
 * pages, /go/ redirects, cache and SEO code stay untouched. Tool = Brand + Product with the same id.
 */
export function adaptNormalized(raw: NormalizedRaw, opts: AdaptOptions): { tabs: RawTabs; issues: Issue[] } {
  const { issues, rejected } = checkIntegrity(raw);
  const now = opts.now ?? new Date();
  const ok = (tab: NormalizedTab) => records(raw[tab] ?? []).filter((r) => !rejected[tab].has(Number(r.__line)));
  const categories = new Map(ok("Categories").filter((c) => (c.status || "active") === "active").map((c) => [c.category_id!, c.slug!.toLowerCase()]));
  const catsByTool = new Map<string, { slug: string; primary: boolean }[]>();
  for (const tc of ok("Tool_Categories")) {
    const slug = categories.get(tc.category_id!);
    if (!slug) continue;
    const list = catsByTool.get(tc.tool_id!) ?? [];
    list.push({ slug, primary: bool(tc.is_primary) });
    catsByTool.set(tc.tool_id!, list);
  }
  const tools = ok("Tools");
  const toolIds = new Set(tools.map((t) => t.tool_id!));

  /** publish_status → the site's status. preview is published only when allowed, and is then marked in the output. */
  const status = (publish: string): "published" | "draft" | "archived" => {
    const v = (publish || "draft").toLowerCase();
    if (v === "published") return "published";
    if (v === "preview") return opts.allowPreview ? "published" : "draft";
    return v === "archived" ? "archived" : "draft";
  };

  const tabs = emptyTabs();
  tabs.Brands = [["brand_id", "name", "slug", "logo_url", "description", "category", "domain", "affiliate_url", "affiliate_program_status", "status", "updated_at", "preview", "featured", "sample"]];
  tabs.Products = [[
    "product_id", "brand_id", "name", "slug", "description", "image_url", "category", "pricing", "pricing_checked_at", "pricing_source_url",
    "features", "use_cases", "pros", "cons", "status", "verification", "verified_at", "source_name", "source_url", "official_url", "platforms",
  ]];
  tabs.Coupons = [["coupon_id", "brand_id", "discount", "code", "title", "terms", "expires_at", "source_url", "verification_status", "verified_at", "status", "sample", "featured", "featured_order"]];
  tabs.Content = [["content_id", "type", "title", "slug", "excerpt", "body", "seo_title", "seo_description", "status", "published_at", "updated_at", "author", "brand_id", "product_id", "product_ids", "post_type"]];

  for (const t of tools) {
    const cats = (catsByTool.get(t.tool_id!) ?? []).sort((a, b) => Number(b.primary) - Number(a.primary));
    const isPreview = t.data_source_type === "preview_import" || t.publish_status === "preview";
    const st = status(t.publish_status!);
    // Sample data is never "verified", whatever the row says.
    const verified = !isPreview && t.verification_status === "verified";
    const updated = parseDay(t.updated_at ?? "") ?? "";
    // The tool's domain: from official_url when the Sheet still has it, otherwise from its link (affiliate_url).
    const official = hostOf(t.official_url || toolLink(t));
    // Fictional rows made to test the layout (not real products), marked by the editor in source_name. A reserved
    // example domain alone does not hide a row: UI-test rows may use one until real data replaces them.
    const sample = /fictional|sample/i.test(t.source_name ?? "");
    // The tool's one outbound link, from its own Tools row (tool_id): affiliate_url (official_url on older Sheets).
    // Fictional rows get none.
    const affiliate = sample ? "" : toolLink(t);
    // Editorial lists (features, pros...) are shown only once someone has checked the tool.
    const editorial = (column: string) => (verified ? t[column] ?? "" : "");
    tabs.Brands.push([
      t.tool_id!, t.name!, t.slug!.toLowerCase(), t.logo_url ?? "", t.short_description || "", cats.map((c) => c.slug).join(","),
      official, affiliate, affiliate ? "approved" : "pending", st, updated, isPreview ? "1" : "", bool(t.featured) ? "1" : "", sample ? "1" : "",
    ]);
    tabs.Products.push([
      t.tool_id!, t.tool_id!, t.name!, t.slug!.toLowerCase(), t.description || t.short_description || "", t.logo_url ?? "",
      cats.map((c) => c.slug).join(","), verified ? t.pricing_details ?? "" : "", verified ? updated : "", "",
      editorial("features"), editorial("use_cases"), editorial("pros"), editorial("cons"), st,
      verified ? "verified" : "unverified", verified ? updated : "", sample ? "" : t.source_name ?? "", sample ? "" : t.source_url ?? "",
      affiliate, editorial("platforms"),
    ]);
  }

  // Deals.is_featured (TRUE/FALSE) and Deals.featured_order (positive whole number, smallest first). A bad value is
  // reported and read as "not featured" / "no order"; the deal itself stays usable.
  const featuredOrders = new Map<number, string[]>();
  for (const d of ok("Deals")) {
    const line = Number(d.__line);
    const flag = (d.is_featured ?? "").trim();
    if (flag && !/^(true|false)$/i.test(flag)) issues.push({ tab: "Deals", row: line, message: `is_featured "${flag}" is not TRUE or FALSE; read as FALSE` });
    const order = (d.featured_order ?? "").trim();
    if (order && !FEATURED_ORDER_RE.test(order)) issues.push({ tab: "Deals", row: line, message: `featured_order "${order}" is not a positive whole number; sorted after the ordered deals` });
    if (isFeaturedFlag(flag) && FEATURED_ORDER_RE.test(order)) featuredOrders.set(Number(order), [...(featuredOrders.get(Number(order)) ?? []), d.deal_id!]);
  }
  for (const [n, ids] of featuredOrders) {
    if (ids.length > 1) issues.push({ tab: "Deals", row: 1, message: `featured_order ${n} is used by ${ids.join(", ")}; they are ordered by deal_id` });
  }

  for (const d of ok("Deals")) {
    const tool = tools.find((t) => t.tool_id === d.tool_id);
    if (!tool) continue;
    if (d.affiliate_url) issues.push({ tab: "Deals", row: Number(d.__line), message: "deal affiliate_url is ignored; the tool's affiliate_url is the only affiliate link" });
    const starts = d.starts_at ? parseDay(d.starts_at) : null;
    if (d.starts_at && !starts) { issues.push({ tab: "Deals", row: Number(d.__line), message: `starts_at "${d.starts_at}" is not a date (use YYYY-MM-DD); row skipped` }); continue; }
    const notStarted = starts !== null && starts > now.toISOString().slice(0, 10);
    // Without a publish_status column (the live Sheet since 2026-10-26) a deal is as public as its tool.
    const st = notStarted ? "draft" : status(d.publish_status === undefined ? tool.publish_status! : d.publish_status);
    // A sample deal (preview row, or a deal of a preview tool) is never shown as checked.
    const sampleDeal = (d.publish_status ?? "").toLowerCase() === "preview" || tool.publish_status === "preview" || tool.data_source_type === "preview_import";
    const verified = !sampleDeal && d.verification_status === "verified";
    tabs.Coupons.push([
      d.deal_id!, d.tool_id!, d.discount!, d.coupon_code ?? "", d.title ?? "", "", d.expires_at ?? "", d.source_url ?? "",
      verified ? "source_verified" : "unverified", verified ? parseDay(d.updated_at ?? "") ?? "" : "", st === "published" ? "published" : "draft",
      sampleDeal ? "1" : "", isFeaturedFlag(d.is_featured) ? "1" : "", FEATURED_ORDER_RE.test((d.featured_order ?? "").trim()) ? d.featured_order!.trim() : "",
    ]);
  }

  const toolById = new Map(tools.map((t) => [t.tool_id!, t]));
  const toolBySource = new Map(tools.filter((t) => t.source_url).map((t) => [t.source_url!, t.tool_id!]));
  for (const p of ok("Blog_Posts")) {
    const toolId = p.tool_id || (p.source_url ? toolBySource.get(p.source_url) : undefined) || "";
    const tool = toolId ? toolById.get(toolId) : undefined;
    // A post about a tool is public only while that tool is: a review must never outlive or precede its tool.
    const toolVisible = !toolId || (tool !== undefined && status(tool.publish_status!) === "published");
    // The tool's source_url is the only place the listing source is stored; the post cites it by lookup, never by copy.
    const sourceHost = tool ? hostOf(tool.source_url ?? "") : "";
    const cite = (p.post_type || "guide") === "review" && sourceHost ? `

*Listing data: ${tool!.source_name || "source"}${(tool!.source_name ?? "").includes(sourceHost) ? "" : ` (${sourceHost})`}.*` : "";
    tabs.Content.push([
      p.post_id!, "blog", p.title!, p.slug!.toLowerCase(), p.excerpt ?? "", `${p.content ?? ""}${p.content ? cite : ""}`, p.seo_title ?? "", p.seo_description ?? "",
      (p.status || "draft") === "published" && toolVisible ? "published" : "draft", p.published_at ?? "", p.updated_at ?? "", p.author ?? "",
      toolId, toolId, "", p.post_type || (toolId ? "review" : "guide"),
    ]);
  }

  // Alternatives: one "alternatives" page per tool that has verified rows. No body is invented.
  const alts = new Map<string, string[]>();
  for (const a of ok("Tool_Alternatives").sort((x, y) => Number(x.display_order || 0) - Number(y.display_order || 0))) {
    if (!toolIds.has(a.tool_id!) || !toolIds.has(a.alternative_tool_id!)) continue;
    alts.set(a.tool_id!, [...(alts.get(a.tool_id!) ?? []), a.alternative_tool_id!]);
  }
  for (const [toolId, ids] of alts) {
    const tool = tools.find((t) => t.tool_id === toolId)!;
    tabs.Content.push([`ALT-${toolId}`, "alternatives", `${tool.name} alternatives`, tool.slug!.toLowerCase(), "", "", "", "", status(tool.publish_status!) === "published" ? "published" : "draft", "", "", "", toolId, toolId, ids.join(","), ""]);
  }
  return { tabs, issues };
}

/** True when the header row of a Tools tab is the normalized layout. */
export function looksNormalized(toolsTab: string[][] | undefined): boolean {
  return (toolsTab?.[0] ?? []).some((h) => normHeader(h) === "tool_id");
}
