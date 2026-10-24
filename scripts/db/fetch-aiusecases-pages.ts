/**
 * Reads each tool page of aiusecases.dev (the source_url of the Tools rows) once and keeps the FACTS shown there:
 * tagline, pros/cons line, pricing label, platforms, "best for", public-signal numbers. Licence: CC BY 4.0
 * (https://aiusecases.dev/data). robots.txt allows it. One request per page, 1.3 s apart, stops on 403/429/CAPTCHA,
 * resumable (pages already in the output file are not fetched again).
 *
 *   npm run db:fetch-pages [-- --max 300] [--delay 1300]
 *
 * Input:  local-data/aiusecases.json (written by npm run db:fetch)   Output: local-data/aiusecases-pages.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UA = "AIDirectoryPreviewBot/0.1 (one-off development import; CC BY 4.0 data)";
const OUT = "local-data/aiusecases-pages.json";

export interface PageFacts {
  slug: string;
  url: string;
  name: string;
  category: string;
  maker: string;
  tagline: string;
  plus: string;
  minus: string;
  priceLabel: string;
  priceNote: string;
  platforms: string[];
  bestFor: string;
  rank: number | null;
  ofTotal: number | null;
  /** Label → value exactly as shown ("GitHub stars · +997 this week" → "184,382"). */
  signals: { label: string; value: string }[];
  useCases: string[];
  fetchedAt: string;
}

/** Chips on the page that name where a tool runs (everything else among the chips is a note on price). */
const PLATFORM_CHIPS = new Set(["web", "mac", "windows", "linux", "ios", "android", "cli", "api", "vscode-extension", "chrome-extension", "jetbrains-plugin", "discord"]);

/** Puts a platform chip that was read as the price note back among the platforms. Idempotent. */
export function normalizeFacts(f: PageFacts): PageFacts {
  if (!PLATFORM_CHIPS.has(f.priceNote)) return f;
  return { ...f, priceNote: "", platforms: [f.priceNote, ...f.platforms.filter((p) => p !== f.priceNote)] };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " "));

export function parsePage(html: string, slug: string, url: string): PageFacts | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1) return null;
  const hero = html.slice(html.indexOf('class="tool-hero"'), html.indexOf("Head to head") > 0 ? html.indexOf("Head to head") : undefined);
  const eyebrow = text(hero.match(/<p class="eyebrow">([\s\S]*?)<\/p>/)?.[1] ?? "");
  const [category = "", maker = ""] = eyebrow.split("·").map((x) => x.replace(/^\s*by\s+/i, "").trim());
  const tagline = text(hero.match(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
  const plus = text(hero.match(/<span class="plus">([\s\S]*?)<\/span>/)?.[1] ?? "").replace(/^\+\s*/, "");
  const minus = text(hero.match(/<span class="minus">([\s\S]*?)<\/span>/)?.[1] ?? "").replace(/^[−-]\s*/, "");
  const priceLabel = text(hero.match(/<span class="price[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? "");
  const chipsDiv = hero.match(/<div class="chips">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const chips = [...chipsDiv.matchAll(/<span class="chip(?: ([a-z]+))?">([\s\S]*?)<\/span>/g)].map((m) => ({ cls: m[1] ?? "", value: text(m[2]!) }));
  const rest = chips.filter((c) => c.cls !== "oss");
  const noteChip = rest.find((c) => !PLATFORM_CHIPS.has(c.value));
  const priceNote = noteChip?.value ?? "";
  const platforms = rest.filter((c) => c !== noteChip).map((c) => c.value);
  const bestFor = text(hero.match(/best for:\s*([\s\S]*?)<\/span>/)?.[1] ?? "");
  const rankMatch = html.match(/rank #(\d+) of (\d+)/);
  const sig = html.match(/<div class="sig">([\s\S]*?)<\/div>\s*<div class="chips"/)?.[1] ?? html.match(/<div class="sig">([\s\S]*?)<\/section>/)?.[1] ?? "";
  const signals = [...sig.matchAll(/<div><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span><\/div>/g)].map((m) => ({ value: text(m[1]!), label: text(m[2]!) }));
  const useCases = [...html.matchAll(/<a class="chip" href="\/use-case\/[a-z0-9-]+\/">([\s\S]*?)<\/a>/g)].map((m) => text(m[1]!)).filter((v, i, a) => a.indexOf(v) === i);
  const name = text(h1[1]!);
  if (!name || !tagline) return null;
  return {
    slug, url, name, category, maker, tagline, plus, minus, priceLabel, priceNote, platforms, bestFor,
    rank: rankMatch ? Number(rankMatch[1]) : null, ofTotal: rankMatch ? Number(rankMatch[2]) : null, signals, useCases, fetchedAt: new Date().toISOString(),
  };
}

class Stop extends Error {}

async function get(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 403 || res.status === 429) throw new Stop(`HTTP ${res.status} from ${url}: access restricted, stopping`);
      if (res.status === 404) return null;
      if (res.status >= 500) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      const html = await res.text();
      if (/g-recaptcha|cf-challenge|Just a moment\.\.\./i.test(html.slice(0, 20000))) throw new Stop(`challenge page at ${url}: stopping`);
      return res.ok ? html : null;
    } catch (e) {
      if (e instanceof Stop) throw e;
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const delay = Number(opt("--delay") ?? 1300);
  const max = Number(opt("--max") ?? Infinity);
  const source = JSON.parse(readFileSync("local-data/aiusecases.json", "utf8")) as { tools: { slug?: string; sourceUrl: string }[] };
  const prev = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { pages: PageFacts[] }).pages : [];
  const pages = new Map(prev.map((p) => [p.url, p]));
  const errors: string[] = [];
  let stopped: string | null = null;
  let fetched = 0;
  const save = () => {
    mkdirSync("local-data", { recursive: true });
    writeFileSync(OUT, JSON.stringify({ source: "https://aiusecases.dev", license: "CC BY 4.0", stopped, errors, pages: [...pages.values()] }, null, 2));
  };
  try {
    for (const t of source.tools) {
      if (pages.has(t.sourceUrl) || fetched >= max) continue;
      await new Promise((r) => setTimeout(r, delay));
      const html = await get(t.sourceUrl);
      const facts = html ? parsePage(html, t.slug ?? "", t.sourceUrl) : null;
      fetched++;
      if (!facts) { errors.push(`${t.sourceUrl}: not available or not parseable`); continue; }
      pages.set(t.sourceUrl, facts);
      if (fetched % 25 === 0) { save(); console.log(`  ${pages.size}/${source.tools.length}`); }
    }
  } catch (e) {
    if (e instanceof Stop) stopped = e.message;
    else throw e;
  }
  save();
  console.log(`Pages with facts: ${pages.size}/${source.tools.length}; fetched this run: ${fetched}; errors: ${errors.length}${stopped ? `; STOPPED: ${stopped}` : ""}`);
  for (const e of errors.slice(0, 10)) console.log(`  - ${e}`);
}

if (process.argv[1]?.includes("fetch-aiusecases-pages")) {
  main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
