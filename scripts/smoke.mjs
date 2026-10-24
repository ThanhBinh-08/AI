// Smoke test against a running server (normally `next start` after `next build`).
// Usage: node scripts/smoke.mjs <baseUrl> [--expect-site=https://real.domain] [--with-data]
// Crawls internal links from the home page and checks status codes, one <h1>, canonical and robots meta,
// JSON-LD, security headers, 404s, the /go/ redirect, robots.txt, sitemap.xml and the client bundle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const base = (process.argv[2] ?? "http://localhost:3400").replace(/\/$/, "");
const expectSite = process.argv.find((a) => a.startsWith("--expect-site="))?.split("=")[1];
const withData = process.argv.includes("--with-data");
const failures = [];
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) failures.push(msg);
};

const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "");

async function get(p, init = {}) {
  return fetch(base + p, { redirect: "manual", ...init });
}

// ---- 1. Crawl ------------------------------------------------------------------------------------
const seen = new Map();
const queue = ["/"];
const goLinks = new Set();
while (queue.length && seen.size < 400) {
  const p = queue.shift();
  if (seen.has(p)) continue;
  const res = await get(p);
  const html = res.headers.get("content-type")?.includes("text/html") ? await res.text() : "";
  seen.set(p, res.status);
  ok(res.status === 200, `${p} returned ${res.status}`);
  if (!html) continue;
  const body = stripScripts(html);
  const h1 = (body.match(/<h1[\s>]/g) ?? []).length;
  ok(h1 === 1, `${p} has ${h1} <h1>`);
  ok(/<title>[^<]{5,}<\/title>/.test(html), `${p} has no title`);
  ok(/<meta name="description" content="[^"]{20,}"/.test(html), `${p} has no meta description`);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!p.startsWith("/search")) ok(Boolean(canonical), `${p} has no canonical`);
  if (expectSite && canonical) ok(canonical.startsWith(expectSite + "/"), `${p} canonical ${canonical} is not on ${expectSite}`);
  ok(!/href="#"/.test(html), `${p} has an href="#" link`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch {
      failures.push(`${p} has invalid JSON-LD`);
    }
  }
  for (const m of body.matchAll(/href="(\/[^"#?]*)(\?[^"#]*)?"/g)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (href.startsWith("/_next/") || /\.(css|js|webp|png|jpg|ico|woff2|mp4|xml|txt)$/.test(href)) continue;
    if (href.startsWith("/go/")) {
      goLinks.add(href);
      continue;
    }
    if (!seen.has(href) && !queue.includes(href)) queue.push(href);
  }
}
console.log(`Crawled ${seen.size} pages`);

// ---- 2. Status codes and headers ------------------------------------------------------------------
for (const p of ["/this-does-not-exist/", "/deals/no-such-deal/", "/tools/no-such-tool/", "/brands/no-such-brand/", "/categories/no-such/", "/blog/no-such-post/", "/compare/no-such/", "/alternatives/no-such/"]) {
  const res = await get(p);
  ok(res.status === 404, `${p} should be 404, got ${res.status}`);
  const html = await res.text();
  // Unmatched URLs are fully server-rendered. For notFound() inside a page, Next 16 sends the 404 UI in the
  // client payload only (empty server body), so the header check applies to the unmatched URL alone.
  if (p === "/this-does-not-exist/") ok((stripScripts(html).match(/class="site-header"/g) ?? []).length === 1, `${p} 404 page should have exactly one header`);
  else ok(html.includes("This page does not exist"), `${p} 404 payload should contain the not-found UI`);
  ok(/noindex/.test(html), `${p} 404 page should be noindex`);
}
const noSlash = await get("/deals");
ok(noSlash.status === 308 && noSlash.headers.get("location")?.endsWith("/deals/"), `/deals should 308 to /deals/, got ${noSlash.status}`);
const home = await get("/");
for (const h of ["x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy", "strict-transport-security"]) {
  ok(home.headers.get(h), `missing security header ${h}`);
}
ok(!home.headers.get("x-powered-by"), "x-powered-by header should be off");

// ---- 3. Affiliate redirect ------------------------------------------------------------------------
for (const link of goLinks) {
  const res = await get(link + "?url=https://evil.example.com&to=//evil.com");
  const loc = res.headers.get("location") ?? "";
  ok(res.status === 302 && loc.startsWith("https://") && !loc.includes("evil"), `${link} → ${res.status} ${loc}`);
  ok(res.headers.get("cache-control") === "no-store", `${link} must not be cacheable`);
}
const unknownGo = await get("/go/does-not-exist/?url=https://evil.example.com");
ok(unknownGo.status === 404 && !unknownGo.headers.get("location"), `/go/ with an unknown id should be 404, got ${unknownGo.status}`);
if (withData) ok(goLinks.size > 0, "expected at least one /go/ link with sample data");
console.log(`Checked ${goLinks.size} /go/ links`);

// ---- 4. Contact endpoint --------------------------------------------------------------------------
const foreign = await get("/api/contact/", { method: "POST", headers: { origin: "https://evil.example.com", "content-type": "application/json" }, body: "{}" });
ok([403, 503].includes(foreign.status), `/api/contact/ from a foreign origin should be refused, got ${foreign.status}`);

// ---- 5. robots.txt and sitemap.xml ----------------------------------------------------------------
const robots = await (await get("/robots.txt")).text();
const sitemapRes = await get("/sitemap.xml");
const sitemap = await sitemapRes.text();
ok(sitemapRes.status === 200, `/sitemap.xml returned ${sitemapRes.status}`);
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (expectSite) {
  ok(robots.includes(`Sitemap: ${expectSite}/sitemap.xml`), "robots.txt should name the production sitemap");
  ok(/Disallow: \/go\//.test(robots) && /Disallow: \/api\//.test(robots), "robots.txt should disallow /go/ and /api/");
  ok(sitemapUrls.length > 0, "sitemap should list URLs in production");
  for (const u of sitemapUrls) {
    ok(u.startsWith(expectSite + "/"), `sitemap URL ${u} is not on ${expectSite}`);
    ok(!/\/(go|api|search)\//.test(u), `sitemap lists a non-indexable URL ${u}`);
    const res = await get(u.slice(expectSite.length));
    ok(res.status === 200, `sitemap URL ${u} returned ${res.status}`);
    const html = await res.text();
    ok(!/<meta name="robots" content="noindex/.test(html), `sitemap URL ${u} is noindex`);
  }
  ok(!/localhost/.test(sitemap + robots), "localhost appears in sitemap or robots");
} else {
  ok(/Disallow: \/$/m.test(robots), "non-production robots.txt should disallow everything");
  ok(sitemapUrls.length === 0, "non-production sitemap should be empty");
}

// ---- 6. No secrets in the browser bundle ----------------------------------------------------------
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const full = path.join(d, f);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|css|html|json)$/.test(f)) files.push(full);
  }
};
try {
  walk(path.join(".next", "static"));
} catch {
  failures.push(".next/static not found: run next build first");
}
const secrets = [/PRIVATE KEY/, /GOOGLE_PRIVATE_KEY/, /GOOGLE_SERVICE_ACCOUNT/, /REVALIDATE_SECRET/, /CONTACT_WEBHOOK/, /iam\.gserviceaccount\.com/, /sjv\.io\/c\//, /partnerstack\.com\/framecast/];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const s of secrets) ok(!s.test(text), `${f} contains ${s}`);
}
console.log(`Scanned ${files.length} client files for secrets and affiliate URLs`);

// ---- Result ---------------------------------------------------------------------------------------
console.log(`${checks} checks, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
