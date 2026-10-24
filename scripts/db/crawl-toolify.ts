/**
 * One-off preview sample from Toolify.ai public pages → local-data/toolify-sample.json. Writes nothing else.
 *
 *   npm run db:crawl -- [--max 28] [--per-category 3] [--categories ai-image-generator,ai-video-generator] [--dry-run]
 *
 * Rules: obeys robots.txt (Crawl-delay 5 s → 5.5 s between requests, sequential), identifies itself, retries only
 * 5xx/timeouts (max 2), STOPS the whole crawl on 403/429/CAPTCHA. Resumable: tools already in the output file are
 * not fetched again. Extracted per tool: name, source URL, one-sentence summary (<=160 chars), official website,
 * the listing category it was found in. NOT extracted: ratings, reviews, traffic, long descriptions, logo/CDN images.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const ORIGIN = "https://www.toolify.ai";
const UA = "Mozilla/5.0 (compatible; AIDirectoryPreviewBot/0.1; one-off development sample)";
const DELAY_MS = 5500;
const OUT = "local-data/toolify-sample.json";

/** Toolify listing handle → site category slug (src/config/categories.ts). Verified present on the Toolify home page. */
export const LISTINGS: Record<string, string> = {
  "ai-image-generator": "ai-image",
  "ai-video-generator": "ai-video",
  "ai-text-to-speech": "ai-audio",
  "ai-developer-tools": "ai-coding",
  "ai-marketing": "marketing",
  "ai-sales-assistant": "business",
  "ai-design-generator": "design",
  "ai-workflow": "automation",
  "ai-note-taker": "productivity",
  "ai-copywriting": "ai-writing",
};

export interface CrawledTool {
  handle: string;
  name: string;
  sourceUrl: string;
  summary: string;
  officialUrl: string | null;
  categorySlug: string;
  listingHandle: string;
  fetchedAt: string;
}

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const MAX = Number(opt("--max") ?? 28);
const PER = Number(opt("--per-category") ?? 3);
const ONLY = opt("--categories")?.split(",").map((s) => s.trim());
const DRY = args.includes("--dry-run");

class StopCrawl extends Error {}
let last = 0;

async function get(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = last + DELAY_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
      if (res.status === 403 || res.status === 429) throw new StopCrawl(`HTTP ${res.status} from ${url}: stopping, not bypassing`);
      if (res.status === 404) return null;
      if (res.status >= 500) continue;
      const html = await res.text();
      if (/g-recaptcha|cf-challenge|captcha-delivery|Just a moment\.\.\./i.test(html.slice(0, 20000))) throw new StopCrawl(`CAPTCHA/challenge at ${url}: stopping`);
      return res.ok ? html : null;
    } catch (e) {
      if (e instanceof StopCrawl) throw e;
    }
  }
  return null;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function toolHandles(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="\/tool\/([a-z0-9][a-z0-9-]*)"/g)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** First sentence, at most 160 characters, no ellipsis tricks. */
export function oneSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const afterName = clean.replace(/^[^:]{1,80}:\s+(?=[A-Z])/, ""); // Toolify prefixes "Name: Name is ..."
  const first = afterName.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? afterName;
  if (first.length <= 160) return first;
  const cut = first.slice(0, 160);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 80)).replace(/[,;:\s]+$/, "") + ".";
}

export function parseToolPage(html: string, handle: string): Omit<CrawledTool, "categorySlug" | "listingHandle" | "fetchedAt"> | null {
  let name = "";
  let summary = "";
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]!) as { "@type"?: string; name?: string; description?: string };
      if (j["@type"] === "SoftwareApplication" && j.name) {
        name = j.name.trim();
        summary = oneSentence(j.description ?? "");
        break;
      }
    } catch {
      /* next block */
    }
  }
  if (!name) return null;
  let officialUrl: string | null = null;
  const link = html.match(/<h1[\s\S]{0,400}?<\/h1>[\s\S]{0,2000}?<a href="(https?:\/\/[^"]+)"[^>]*rel="dofollow"/);
  if (link) {
    try {
      const u = new URL(decode(link[1]!));
      u.searchParams.delete("utm_source");
      if (u.protocol === "https:" && !/toolify\.ai$/i.test(u.hostname)) officialUrl = u.toString().replace(/\/$/, "");
    } catch {
      /* leave null */
    }
  }
  return { handle, name, sourceUrl: `${ORIGIN}/tool/${handle}`, summary, officialUrl };
}

async function main() {
  const wanted = Object.entries(LISTINGS).filter(([h]) => !ONLY || ONLY.includes(h));
  const existing: CrawledTool[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { tools: CrawledTool[] }).tools : [];
  const have = new Map(existing.map((t) => [t.handle, t]));
  const errors: string[] = [];
  let stopped: string | null = null;
  console.log(`Plan: up to ${MAX} tools, ${PER} per listing, ${wanted.length} listings, ${DELAY_MS} ms between requests${DRY ? " (dry run: fetch nothing)" : ""}`);
  if (DRY) return;

  try {
    for (const [listing, slug] of wanted) {
      if (have.size >= MAX) break;
      const html = await get(`${ORIGIN}/category/${listing}`);
      if (!html) { errors.push(`listing ${listing}: not available (skipped)`); continue; }
      let taken = 0;
      for (const handle of toolHandles(html)) {
        if (taken >= PER || have.size >= MAX) break;
        if (have.has(handle)) continue; // duplicate across listings or earlier run
        const page = await get(`${ORIGIN}/tool/${handle}`);
        const parsed = page ? parseToolPage(page, handle) : null;
        if (!parsed) { errors.push(`tool ${handle}: could not be parsed (skipped)`); continue; }
        have.set(handle, { ...parsed, categorySlug: slug, listingHandle: listing, fetchedAt: new Date().toISOString() });
        taken++;
        console.log(`  ok  ${handle.padEnd(40)} ${parsed.officialUrl ?? "(no official url)"}`);
      }
    }
  } catch (e) {
    if (e instanceof StopCrawl) stopped = e.message;
    else throw e;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  const tools = [...have.values()];
  writeFileSync(OUT, JSON.stringify({ source: ORIGIN, generatedAt: new Date().toISOString(), stopped, errors, tools }, null, 2));
  console.log(`\nExtracted ${tools.length} tools → ${OUT}`);
  console.log(`Without official URL: ${tools.filter((t) => !t.officialUrl).length}; errors: ${errors.length}${stopped ? `; STOPPED: ${stopped}` : ""}`);
  for (const e of errors) console.log(`  - ${e}`);
}

if (process.argv[1]?.includes("crawl-toolify")) {
  main().catch((e) => {
    console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
