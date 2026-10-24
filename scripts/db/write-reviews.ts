/**
 * Writes the review text of Blog_Posts review rows from the facts read on each source_url page
 * (local-data/aiusecases-pages.json, npm run db:fetch-pages). Only EMPTY cells are filled: content, excerpt,
 * author, published_at, updated_at, status, seo_title, seo_description. Nothing you typed is overwritten.
 *
 * The text states only what the source page shows, says when it was read, and says plainly that the tool was not
 * tested by us. No opinion, rating or verdict is invented.
 *
 *   npm run db:write-reviews              dry run (prints one sample)
 *   npm run db:write-reviews -- --apply   write, read back, validate
 */
import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";
import { checkIntegrity, emptyNormalized, records, type NormalizedRaw } from "../../src/data/normalized/adapt";
import { NORMALIZED_TABS } from "../../src/data/normalized/schema";
import { clip } from "../../src/lib/text";
import { normalizeFacts, type PageFacts } from "./fetch-aiusecases-pages";

const APPLY = process.argv.includes("--apply");
const AUTHOR = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "AI Tools & Deals";
const letter = (i: number) => String.fromCharCode(65 + i);

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export function buildReview(f: PageFacts, officialUrl: string): { content: string; excerpt: string; seoTitle: string; seoDescription: string } {
  const asOf = f.fetchedAt.slice(0, 10);
  const out: string[] = [];
  out.push(`${f.name} is listed under ${f.category || "AI tools"}${f.maker && f.maker !== f.name ? ` and made by ${f.maker}` : ""}. ${sentence(f.tagline)}`);
  out.push(`*This review summarizes public information as of ${asOf}. We have not tested ${f.name} ourselves.*`);

  out.push("## What it does");
  out.push(sentence(f.tagline) + (f.bestFor ? ` The source says it suits ${f.bestFor}.` : ""));
  if (f.useCases.length > 0) out.push(`Use cases it is listed for: ${f.useCases.join(", ")}.`);

  if (f.priceLabel || f.priceNote) {
    out.push("## Pricing");
    out.push(`${f.priceLabel ? `The source lists the pricing as **${f.priceLabel}**.` : ""}${f.priceNote ? ` Its note on price: "${f.priceNote}".` : ""} Prices change, so confirm on ${host(officialUrl) || "the official site"} before you buy.`.trim());
  }
  if (f.platforms.length > 0) {
    out.push("## Platforms");
    out.push(`Listed platforms: ${f.platforms.join(", ")}.`);
  }
  if (f.plus || f.minus) {
    out.push("## Strengths and limits, as listed by the source");
    out.push([f.plus ? `- **Strength:** ${sentence(f.plus)}` : "", f.minus ? `- **Limit:** ${sentence(f.minus)}` : ""].filter(Boolean).join("\n"));
  }
  const shown = f.signals.filter((s) => !/^evidence score/i.test(s.label) && /\d/.test(s.value)).slice(0, 5);
  const score = f.signals.find((s) => /^evidence score/i.test(s.label));
  if (shown.length > 0 || (f.rank && score)) {
    out.push(`## Public signals on ${asOf}`);
    // Labels are the source's own words: "our release feed" means theirs, not this site's.
    const lines = shown.map((s) => `- **${s.value}** ${s.label.replace(/\bour\b/gi, "the source's")}`);
    out.push(lines.join("\n"));
    if (f.rank && f.ofTotal && score)
      out.push(`AI Use Cases ranked ${f.name} #${f.rank} of ${f.ofTotal} tools on that date (evidence score ${score.value} out of 100). The score measures public evidence of use and maintenance. It is not a quality rating or an endorsement, and it changes with every nightly rebuild.`);
  }
  out.push("## Before you choose");
  out.push(`Check the current features, limits and price on the official site${officialUrl ? ` (${host(officialUrl)})` : ""}. If you try ${f.name} and find something that differs from this summary, tell us through the contact page.`);

  const priceBit = f.priceLabel ? ` Pricing: ${f.priceLabel}.` : "";
  const platformBit = f.platforms.length ? ` Platforms: ${f.platforms.slice(0, 4).join(", ")}.` : "";
  return {
    content: out.join("\n\n"),
    excerpt: clip(sentence(f.tagline), 160),
    seoTitle: clip(`${f.name} review: pricing, platforms and trade-offs`, 60),
    seoDescription: clip(`${sentence(f.tagline)}${priceBit}${platformBit}`, 158),
  };
}

async function main() {
  const id = process.env.GOOGLE_SHEET_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  if (!id || !email || !key) throw new Error("GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY missing");
  const tk = (await new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }).getAccessToken()).token!;
  const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const read = async (): Promise<NormalizedRaw> => {
    const ranges = NORMALIZED_TABS.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join("&");
    const res = await fetch(`${base}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`, { headers: h });
    if (!res.ok) throw new Error(`read failed (${res.status})`);
    const data = (await res.json()) as { valueRanges: { values?: unknown[][] }[] };
    const raw = emptyNormalized();
    NORMALIZED_TABS.forEach((t, i) => { raw[t] = (data.valueRanges[i]?.values ?? []).map((r) => r.map((c) => String(c ?? ""))); });
    return raw;
  };

  const pages = new Map((JSON.parse(readFileSync("local-data/aiusecases-pages.json", "utf8")) as { pages: PageFacts[] }).pages.map((p) => [p.url, normalizeFacts(p)]));
  const sheet = await read();
  const header = sheet.Blog_Posts[0] ?? [];
  const col = (n: string) => { const i = header.indexOf(n); if (i < 0) throw new Error(`Blog_Posts has no ${n} column`); return i; };
  const toolBySource = new Map(records(sheet.Tools).filter((t) => t.source_url).map((t) => [t.source_url!, t]));
  const today = new Date().toISOString().slice(0, 10);

  const data: { range: string; values: string[][] }[] = [];
  const merged = sheet.Blog_Posts.map((r) => [...r]);
  let filled = 0, noFacts = 0, kept = 0, sample = "";
  sheet.Blog_Posts.forEach((row, idx) => {
    if (idx === 0) return;
    const get = (n: string) => (row[col(n)] ?? "").trim();
    if (get("post_type") !== "review" || get("content")) { if (get("content")) kept++; return; }
    const facts = pages.get(get("source_url"));
    const tool = toolBySource.get(get("source_url"));
    if (!facts || !tool) { noFacts++; return; }
    const r = buildReview(facts, tool.official_url ?? "");
    const values: Record<string, string> = { content: r.content, excerpt: r.excerpt, author: AUTHOR, published_at: today, updated_at: today, status: "published", seo_title: r.seoTitle, seo_description: r.seoDescription };
    for (const [name, v] of Object.entries(values)) {
      // Fill-only: the status column already says "draft" on stubs, so it is replaced; every other cell only when empty.
      if (name !== "status" && get(name)) continue;
      data.push({ range: `'Blog_Posts'!${letter(col(name))}${idx + 1}`, values: [[v]] });
      while (merged[idx]!.length <= col(name)) merged[idx]!.push("");
      merged[idx]![col(name)] = v;
    }
    filled++;
    if (!sample) sample = r.content;
  });

  const issues = checkIntegrity({ ...sheet, Blog_Posts: merged }).issues;
  const lens = merged.slice(1).map((r) => (r[col("content")] ?? "").split(/\s+/).filter(Boolean).length).filter((n) => n > 0);
  console.log(`Reviews to write: ${filled}; already have content (kept): ${kept}; no source facts: ${noFacts}; cells to write: ${data.length}`);
  if (lens.length) console.log(`Words per review: min ${Math.min(...lens)}, max ${Math.max(...lens)}, avg ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}`);
  console.log(`Integrity issues after: ${issues.length}`);
  for (const i of issues.slice(0, 10)) console.log(`  ISSUE ${i.tab}#${i.row}: ${i.message}`);
  if (!APPLY) { console.log("\n----- sample -----\n" + sample + "\n------------------\nDry run only. Add --apply to write."); return; }
  if (issues.length > 0) throw new Error("result would not be valid; nothing written");
  for (let i = 0; i < data.length; i += 400) {
    const res = await fetch(`${base}/values:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ valueInputOption: "RAW", data: data.slice(i, i + 400) }) });
    if (!res.ok) throw new Error(`write failed (${res.status})`);
  }
  console.log("Written. Verify with: npm run db:write-reviews (dry run should now list 0 reviews to write).");
}

if (process.argv[1]?.includes("write-reviews")) {
  main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
