/**
 * Finds a brand logo for every Tools row from the tool's own official_url page, measures how light or dark it is,
 * and (with --apply) writes the logo URL into the EMPTY logo_url cells of the Tools tab.
 *
 * Source per tool, in this order: <link rel="apple-touch-icon">, the largest <link rel="icon"> (svg first),
 * /favicon.ico, then the schema.org "logo" of the page. One GET of the home page per tool with an identifying
 * User-Agent; a 403/429 is recorded as a failure and never worked around.
 *
 * Tone (written to src/config/logo-tones.json, keyed by logo URL, read by <BrandLogo>):
 *   own   the image is opaque and brings its own background (app-icon style)        -> plain disc
 *   dark  the visible pixels are dark                                                -> bright disc
 *   light the visible pixels are light (a white logo would vanish on a white disc)   -> deep disc
 *   mid   anything else / not measurable                                             -> plain disc
 *
 *   npm run db:fetch-logos                dry run: fetch + measure, writes local-data/logos.json and the tone map
 *   npm run db:fetch-logos -- --apply     also write logo_url into empty Tools cells (nothing typed is overwritten)
 *   npm run db:fetch-logos -- --refresh   ignore the cache in local-data/logos.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JWT } from "google-auth-library";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const REFRESH = process.argv.includes("--refresh");
const UA = "AIDirectoryLogoBot/0.1 (+brand logo lookup for a tool directory; one request per site)";
const CACHE = "local-data/logos.json";
const TONES = "src/config/logo-tones.json";
const MAX_IMG = 1_500_000;
const MAX_HTML = 600_000;

type Tone = "own" | "dark" | "light" | "mid";
type Result = { tool_id: string; name: string; page: string; logo: string; from: string; tone: Tone; note: string };

const letter = (i: number) => String.fromCharCode(65 + i);
const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(2).find((v) => v !== undefined) ?? "";

async function getText(url: string): Promise<{ body: string; finalUrl: string }> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { body: (await res.text()).slice(0, MAX_HTML), finalUrl: res.url };
}

async function getImage(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (type && !type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMG) return null;
    return { buf, type };
  } catch {
    return null;
  }
}

function candidates(html: string, base: string): { url: string; from: string; score: number }[] {
  const out: { url: string; from: string; score: number }[] = [];
  const abs = (href: string) => { try { const u = new URL(href.trim(), base); return u.protocol === "https:" ? u.toString() : ""; } catch { return ""; } };
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = abs(attr(tag, "href"));
    if (!href || !/\b(apple-touch-icon|icon)\b/.test(rel) || /mask-icon/.test(rel)) continue;
    const size = Math.max(0, ...(attr(tag, "sizes").match(/\d+/g) ?? ["0"]).map(Number));
    const svg = /\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, "type"));
    if (/apple-touch-icon/.test(rel)) out.push({ url: href, from: "apple-touch-icon", score: 1000 + size });
    else out.push({ url: href, from: svg ? "icon-svg" : "icon", score: (svg ? 900 : 100) + size });
  }
  out.push({ url: abs("/favicon.ico"), from: "favicon.ico", score: 50 });
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          const l = o.logo;
          const url = typeof l === "string" ? l : l && typeof l === "object" ? String((l as Record<string, unknown>).url ?? "") : "";
          if (url && abs(url)) out.push({ url: abs(url), from: "schema-logo", score: 20 });
          Object.values(o).forEach(walk);
        }
      };
      walk(JSON.parse(m[1]!));
    } catch { /* ignore broken JSON-LD */ }
  }
  return out.filter((c) => c.url).sort((a, b) => b.score - a.score);
}

/** How light or dark the visible part of the image is. */
async function measure(buf: Buffer): Promise<Tone | null> {
  try {
    const { data, info } = await sharp(buf, { density: 144 }).resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let seen = 0, lum = 0, opaque = 0;
    const n = info.width * info.height;
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3]! / 255;
      if (a >= 0.95) opaque++;
      if (a < 0.4) continue;
      seen++;
      lum += (0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!) / 255;
    }
    if (seen < 30) return null;
    // A square image that is almost fully opaque is an app icon with its own background.
    if (opaque / n > 0.9) return "own";
    const mean = lum / seen;
    return mean < 0.38 ? "dark" : mean > 0.78 ? "light" : "mid";
  } catch {
    return null;
  }
}

/** Hosts whose icon is not the tool's brand: a repo page shows the code host's logo, example.com is a placeholder. */
const NOT_A_BRAND_HOST = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|example\.(com|org|net))$/i;

async function resolveTool(tool: { tool_id: string; name: string; official_url: string }): Promise<Result> {
  const base: Result = { tool_id: tool.tool_id, name: tool.name, page: tool.official_url, logo: "", from: "", tone: "mid", note: "" };
  try {
    if (NOT_A_BRAND_HOST.test(new URL(tool.official_url).hostname)) return { ...base, note: "official_url is a code host or placeholder, not the brand's own site" };
  } catch { return { ...base, note: "official_url is not a URL" }; }
  let html = "", finalUrl = tool.official_url;
  try {
    ({ body: html, finalUrl } = await getText(tool.official_url));
  } catch (e) {
    // Fall back to the site root's /favicon.ico below; the page itself is not worked around.
    base.note = `page: ${e instanceof Error ? e.message : String(e)}`;
    if (/HTTP 40[13]|HTTP 429/.test(base.note)) return base;
  }
  const list = candidates(html, finalUrl);
  if (list.length === 0) { try { list.push({ url: new URL("/favicon.ico", finalUrl).toString(), from: "favicon.ico", score: 50 }); } catch { /* bad url */ } }
  for (const c of list.slice(0, 5)) {
    const img = await getImage(c.url);
    if (!img) continue;
    const tone = await measure(img.buf);
    if (tone === null && c.from === "favicon.ico" && list.length > 1) continue; // .ico cannot be measured: prefer a measurable image
    return { ...base, logo: c.url, from: c.from, tone: tone ?? "mid", note: tone === null ? "not measurable" : "" };
  }
  return { ...base, note: base.note || "no usable image found" };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]!, i); }
  }));
  return out;
}

async function main() {
  const id = process.env.GOOGLE_SHEET_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  if (!id || !email || !key) throw new Error("GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY missing");
  const tk = (await new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }).getAccessToken()).token!;
  const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;

  const res = await fetch(`${base}/values/${encodeURIComponent("'Tools'")}?valueRenderOption=FORMATTED_VALUE`, { headers: h });
  if (!res.ok) throw new Error(`read failed (${res.status})`);
  const rows = ((await res.json()) as { values?: string[][] }).values ?? [];
  const header = rows[0] ?? [];
  const col = (n: string) => { const i = header.indexOf(n); if (i < 0) throw new Error(`Tools has no ${n} column`); return i; };
  const [cId, cName, cOfficial, cLogo] = [col("tool_id"), col("name"), col("official_url"), col("logo_url")];
  const tools = rows.slice(1).map((r, i) => ({ row: i + 2, tool_id: (r[cId] ?? "").trim(), name: (r[cName] ?? "").trim(), official_url: (r[cOfficial] ?? "").trim(), logo: (r[cLogo] ?? "").trim() })).filter((t) => t.tool_id);

  mkdirSync("local-data", { recursive: true });
  const cache = new Map<string, Result>(!REFRESH && existsSync(CACHE) ? (JSON.parse(readFileSync(CACHE, "utf8")) as Result[]).map((r) => [r.tool_id, r]) : []);
  const todo = tools.filter((t) => t.official_url && !t.logo && !cache.get(t.tool_id)?.logo);
  console.log(`Tools: ${tools.length}; with logo already: ${tools.filter((t) => t.logo).length}; to look up: ${todo.length}`);
  let done = 0;
  await pool(todo, 8, async (t) => {
    const r = await resolveTool(t);
    cache.set(t.tool_id, r);
    if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`);
  });
  writeFileSync(CACHE, JSON.stringify([...cache.values()], null, 2));

  const found = [...cache.values()].filter((r) => r.logo);
  const tones: Record<string, Tone> = {};
  for (const r of found) if (r.tone !== "mid") tones[r.logo] = r.tone;
  writeFileSync(TONES, JSON.stringify(Object.fromEntries(Object.entries(tones).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");

  const count = (t: Tone) => found.filter((r) => r.tone === t).length;
  console.log(`Logos found: ${found.length}/${tools.length}  (own ${count("own")}, dark ${count("dark")}, light ${count("light")}, mid ${count("mid")})`);
  const sources = new Map<string, number>();
  for (const r of found) sources.set(r.from, (sources.get(r.from) ?? 0) + 1);
  console.log("By source:", [...sources].map(([k, v]) => `${k} ${v}`).join(", "));
  const missing = tools.filter((t) => !t.logo && !cache.get(t.tool_id)?.logo);
  console.log(`Missing: ${missing.length}`);
  for (const t of missing) console.log(`  ${t.tool_id} ${t.name}: ${cache.get(t.tool_id)?.note ?? "no official_url"}`);

  if (!APPLY) { console.log("\nDry run only. Add --apply to write logo_url into empty Tools cells."); return; }
  const data = tools.filter((t) => !t.logo && cache.get(t.tool_id)?.logo).map((t) => ({ range: `'Tools'!${letter(cLogo)}${t.row}`, values: [[cache.get(t.tool_id)!.logo]] }));
  for (let i = 0; i < data.length; i += 400) {
    const w = await fetch(`${base}/values:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ valueInputOption: "RAW", data: data.slice(i, i + 400) }) });
    if (!w.ok) throw new Error(`write failed (${w.status})`);
  }
  console.log(`Written: ${data.length} logo_url cells.`);
}

main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
