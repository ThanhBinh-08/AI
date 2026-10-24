/**
 * One request to https://aiusecases.dev/data.json (CC BY 4.0, robots Allow, no key) → local-data/aiusecases.json,
 * mapped to the importer's input format. Nothing is written to Google Sheets here.
 *
 *   npm run db:fetch -- [--max 300] [--file path/to/data.json]   (--file maps a downloaded copy, no request)
 *
 * Taken per tool: slug, name, tagline (<=160 chars, as the short description), official url, pricing label, use cases
 * (→ categories). NOT taken: plus/minus (editorial), rank scores, logos. Attribution required by the licence:
 * "AI tool rankings from AI Use Cases (https://aiusecases.dev), 2026, CC BY 4.0" with a link (site About page + Settings).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { CrawledInput } from "../../src/data/normalized/import";
import { SLUG_RE } from "../../src/lib/text";

const URL_DATA = "https://aiusecases.dev/data.json";
const UA = "AIDirectoryPreviewBot/0.1 (one-off development import; CC BY 4.0 data)";
const OUT = "local-data/aiusecases.json";
export const ATTRIBUTION = "AI tool rankings from AI Use Cases (https://aiusecases.dev), 2026, CC BY 4.0";

/** Source use-case category → site category slug (src/config/categories.ts). Unlisted = no match, left empty. */
export const CATEGORY_MAP: Record<string, string> = {
  Coding: "ai-coding",
  "Agents & automation": "automation",
  "Chat & research": "productivity",
  Productivity: "productivity",
  Audio: "ai-audio",
  Images: "ai-image",
  Video: "ai-video",
  Writing: "ai-writing",
  Business: "business",
  Design: "design",
};

/** The source's own pricing label → controlled pricing_model. "open-source" says nothing about hosted price → unknown. */
const PRICING: Record<string, string> = { free: "free", freemium: "freemium", paid: "paid" };

interface SourceTool { slug?: unknown; name?: unknown; tagline?: unknown; use_cases?: unknown; pricing?: unknown; url?: unknown }
interface SourceData { use_cases?: { slug?: string; category?: string }[]; tools?: SourceTool[]; at?: string }

export interface MapResult { tools: CrawledInput[]; rejected: { slug: string; reason: string }[]; unmappedCategories: Record<string, number> }

export function mapAiUseCases(data: SourceData, max = Infinity): MapResult {
  const ucCategory = new Map((data.use_cases ?? []).map((u) => [u.slug, u.category]));
  const out: MapResult = { tools: [], rejected: [], unmappedCategories: {} };
  const seen = new Set<string>();
  for (const t of data.tools ?? []) {
    if (out.tools.length >= max) break;
    const slug = typeof t.slug === "string" ? t.slug : "";
    const name = typeof t.name === "string" ? t.name.trim() : "";
    if (!SLUG_RE.test(slug) || !name) { out.rejected.push({ slug: slug || "(none)", reason: "missing or invalid slug/name" }); continue; }
    if (seen.has(slug)) { out.rejected.push({ slug, reason: "duplicate slug in source" }); continue; }
    seen.add(slug);
    let officialUrl: string | null = null;
    try {
      const u = new URL(String(t.url));
      if (u.protocol === "https:") officialUrl = u.toString().replace(/\/$/, "");
    } catch { /* stays null */ }
    const cats: string[] = [];
    for (const uc of Array.isArray(t.use_cases) ? t.use_cases : []) {
      const sourceCat = ucCategory.get(String(uc));
      const mapped = sourceCat ? CATEGORY_MAP[sourceCat] : undefined;
      if (mapped) { if (!cats.includes(mapped)) cats.push(mapped); }
      else if (sourceCat) out.unmappedCategories[sourceCat] = (out.unmappedCategories[sourceCat] ?? 0) + 1;
    }
    const label = typeof t.pricing === "string" ? t.pricing : "";
    const tagline = typeof t.tagline === "string" ? t.tagline.trim() : "";
    out.tools.push({
      handle: slug, slug, name, sourceUrl: `https://aiusecases.dev/tool/${slug}/`, summary: tagline.length <= 160 ? tagline : "", officialUrl,
      categorySlug: cats[0] ?? "", categorySlugs: cats, sourceName: "AI Use Cases (aiusecases.dev, CC BY 4.0)",
      pricingModel: PRICING[label] ?? "unknown", pricingDetails: label ? `Source label: ${label}` : "",
    });
  }
  return out;
}

async function download(): Promise<SourceData> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(URL_DATA, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status}: access restricted, stopping`);
      if (res.status >= 500) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SourceData;
    } catch (e) {
      if (e instanceof Error && /^HTTP/.test(e.message)) throw e;
    }
  }
  throw new Error("data.json could not be downloaded");
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const file = opt("--file");
  const data = file ? (JSON.parse(readFileSync(file, "utf8")) as SourceData) : await download();
  const mapped = mapAiUseCases(data, Number(opt("--max") ?? Infinity));
  mkdirSync("local-data", { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    source: "https://aiusecases.dev/data.json", license: "CC BY 4.0", attribution: ATTRIBUTION, sourceBuiltAt: data.at ?? null,
    generatedAt: new Date().toISOString(), rejected: mapped.rejected, unmappedCategories: mapped.unmappedCategories, tools: mapped.tools,
  }, null, 2));
  const noCat = mapped.tools.filter((t) => t.categorySlugs?.length === 0).length;
  console.log(`Source built at ${data.at ?? "?"}: ${data.tools?.length ?? 0} tools. Mapped ${mapped.tools.length}, rejected ${mapped.rejected.length} → ${OUT}`);
  console.log(`Without a matching site category: ${noCat}; unmapped source categories (use-case count): ${JSON.stringify(mapped.unmappedCategories)}`);
  console.log(`Without official URL: ${mapped.tools.filter((t) => !t.officialUrl).length}; without tagline: ${mapped.tools.filter((t) => !t.summary).length}`);
}

if (process.argv[1]?.includes("fetch-aiusecases")) {
  main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
