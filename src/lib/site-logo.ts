/**
 * Finds the logo a website shows for itself: <link rel="apple-touch-icon">, the largest <link rel="icon"> (svg first),
 * /favicon.ico, then the schema.org "logo" of the home page. Used by `npm run db:fetch-logos` (writes logo_url into the
 * Sheet) and by /logo/<tool_id>/ (the logo shown for a tool whose logo_url is still empty).
 *
 * One GET of the home page with an identifying User-Agent; a 401/403/429 is a failure and is never worked around.
 */
import { NOT_A_BRAND_HOST } from "./logo-path";

export { NOT_A_BRAND_HOST };

export const LOGO_UA = "AIDirectoryLogoBot/0.1 (+brand logo lookup for a tool directory; one request per site)";
const MAX_IMG = 1_500_000;
const MAX_HTML = 600_000;


/** Image types a logo may be served as. */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon", "image/avif"]);

export type LogoCandidate = { url: string; from: string; score: number };

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(2).find((v) => v !== undefined) ?? "";

export async function getText(url: string): Promise<{ body: string; finalUrl: string }> {
  const res = await fetch(url, { headers: { "User-Agent": LOGO_UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { body: (await res.text()).slice(0, MAX_HTML), finalUrl: res.url };
}

/** The image at `url`, when it is an image of a reasonable size; null otherwise. */
export async function getImage(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": LOGO_UA, Accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (!res.ok || new URL(res.url).protocol !== "https:") return null;
    let type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (type && !type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMG) return null;
    if (!type) type = /\.svg(\?|$)/i.test(url) ? "image/svg+xml" : /\.ico(\?|$)/i.test(url) ? "image/x-icon" : "image/png";
    return { buf, type };
  } catch {
    return null;
  }
}

/** Logo candidates found in a home page, best first. */
export function candidates(html: string, base: string): LogoCandidate[] {
  const out: LogoCandidate[] = [];
  const abs = (href: string) => {
    try {
      const u = new URL(href.trim(), base);
      return u.protocol === "https:" ? u.toString() : "";
    } catch {
      return "";
    }
  };
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
    } catch {
      /* ignore broken JSON-LD */
    }
  }
  return out.filter((c) => c.url).sort((a, b) => b.score - a.score);
}

/**
 * The logo image of the site at `domain` (home page icons, else /favicon.ico), ready to serve; null when the site
 * has none, blocks the request, or is not a brand's own site.
 */
export async function findSiteLogo(domain: string): Promise<{ buf: Buffer; type: string; from: string } | null> {
  if (!domain || NOT_A_BRAND_HOST.test(domain)) return null;
  const home = `https://${domain}/`;
  let html = "";
  let finalUrl = home;
  try {
    ({ body: html, finalUrl } = await getText(home));
  } catch (e) {
    if (/HTTP 40[13]|HTTP 429/.test(e instanceof Error ? e.message : "")) return null;
  }
  for (const c of candidates(html, finalUrl).slice(0, 5)) {
    const img = await getImage(c.url);
    if (img && IMAGE_TYPES.has(img.type)) return { ...img, from: c.from };
  }
  return null;
}
