/**
 * Design-only: copies local-data/normalized.json to local-data/design-preview.json and adds FICTIONAL tools with
 * FICTIONAL deals so the Deals page and cards can be designed with realistic content. Never writes to Google Sheets.
 * Names, codes and discounts are invented; every row is preview_import / unverified / preview, source "Fictional sample".
 *
 *   npm run db:design-samples
 */
import { readFileSync, writeFileSync } from "node:fs";
import { HEADERS, NORMALIZED_TABS, type NormalizedTab } from "../../src/data/normalized/schema";

const book = JSON.parse(readFileSync("local-data/normalized.json", "utf8")) as Record<NormalizedTab, string[][]>;
for (const t of NORMALIZED_TABS) if (!book[t]?.length) book[t] = [[...HEADERS[t]]];
const stamp = new Date().toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const put = (tab: NormalizedTab, v: Record<string, string>) => book[tab]!.push(HEADERS[tab].map((h) => v[h] ?? ""));
const catId = new Map(book.Categories!.slice(1).map((r) => [r[2]!, r[0]!]));
const nextId = book.Tools!.length; // T0258...

interface Sample { name: string; slug: string; cat: string; blurb: string; featured: boolean; model: string; deal?: { id: string; title: string; discount: string; code: string; days: number | null; verified?: boolean } }

const SAMPLES: Sample[] = [
  { name: "Quillnest", slug: "quillnest", cat: "ai-writing", blurb: "Drafts and rewrites long-form copy in your brand voice.", featured: true, model: "freemium", deal: { id: "DSMP01", title: "Quillnest annual plan", discount: "30% off", code: "SAMPLE30", days: 9, verified: true } },
  { name: "Pixelrill", slug: "pixelrill", cat: "ai-image", blurb: "Turns a sentence into a set of on-brand product images.", featured: true, model: "paid", deal: { id: "DSMP02", title: "First three months of Pixelrill Pro", discount: "50% off", code: "SAMPLEPIX50", days: 21 } },
  { name: "Reelmoor", slug: "reelmoor", cat: "ai-video", blurb: "Cuts long recordings into captioned short clips.", featured: true, model: "freemium", deal: { id: "DSMP03", title: "Reelmoor Team starter", discount: "2 months free", code: "", days: 5 } },
  { name: "Codeharbor", slug: "codeharbor", cat: "ai-coding", blurb: "Reviews pull requests and explains failing tests.", featured: false, model: "paid", deal: { id: "DSMP04", title: "Codeharbor for small teams", discount: "25% off", code: "SAMPLEHARBOR25", days: 60 } },
  { name: "Voxtide", slug: "voxtide", cat: "ai-audio", blurb: "Clean transcripts and natural voice-overs from one upload.", featured: false, model: "freemium", deal: { id: "DSMP05", title: "Voxtide Creator, yearly", discount: "$40 off", code: "SAMPLEVOX40", days: 14, verified: true } },
  { name: "Taskwell", slug: "taskwell", cat: "productivity", blurb: "Turns meeting notes into assigned, dated tasks.", featured: false, model: "freemium", deal: { id: "DSMP06", title: "Taskwell Business trial extension", discount: "30 extra days", code: "SAMPLEWELL", days: null } },
  { name: "Adlantern", slug: "adlantern", cat: "marketing", blurb: "Generates and tests ad variations across channels.", featured: false, model: "paid", deal: { id: "DSMP07", title: "Adlantern Growth plan", discount: "20% off", code: "SAMPLELANTERN20", days: 3 } },
  { name: "Deskvale", slug: "deskvale", cat: "business", blurb: "Answers routine support tickets and hands off the rest.", featured: false, model: "contact_for_pricing", deal: { id: "DSMP08", title: "Deskvale onboarding credit", discount: "$100 credit", code: "SAMPLEDESK", days: 45 } },
  { name: "Flowmint", slug: "flowmint", cat: "automation", blurb: "Connects apps and runs multi-step agents on a schedule.", featured: false, model: "usage_based", deal: { id: "DSMP09", title: "Flowmint annual billing", discount: "15% off", code: "SAMPLEFLOW15", days: 30 } },
  { name: "Brandsketch", slug: "brandsketch", cat: "design", blurb: "Makes logos, palettes and slide templates from a brief.", featured: false, model: "freemium", deal: { id: "DSMP10", title: "Brandsketch Studio", discount: "40% off", code: "SAMPLESKETCH40", days: 11 } },
  { name: "Pixelrill", slug: "", cat: "", blurb: "", featured: false, model: "", deal: { id: "DSMP11", title: "Pixelrill education pricing", discount: "60% off", code: "SAMPLEEDU60", days: -3 } },
];

let n = nextId;
const ids = new Map<string, string>();
for (const s of SAMPLES) {
  if (!s.slug) continue;
  const id = `T${String(n++).padStart(4, "0")}`;
  ids.set(s.name, id);
  put("Tools", {
    tool_id: id, name: s.name, slug: s.slug, short_description: s.blurb, official_url: `https://www.${s.slug}.example.com`, pricing_model: s.model,
    source_name: "Fictional sample", data_source_type: "preview_import", verification_status: "unverified", publish_status: "preview",
    featured: s.featured ? "TRUE" : "FALSE", display_order: String(n), imported_at: stamp, created_at: stamp, updated_at: stamp,
  });
  put("Tool_Categories", { tool_category_id: `TC-${id}-${catId.get(s.cat)}`, tool_id: id, category_id: catId.get(s.cat)!, is_primary: "TRUE", created_at: stamp });
}
/** Fictional reviews of the first two fictional tools: layout samples only, no claims about real products. */
const REVIEWS = ["quillnest", "pixelrill"];
for (const slug of REVIEWS) {
  const s = SAMPLES.find((x) => x.slug === slug)!;
  const id = ids.get(s.name)!;
  put("Blog_Posts", {
    post_id: `REV-${id}`, title: `${s.name} review (sample)`, slug: `${slug}-review`, excerpt: `A fictional sample review of ${s.name}, used to test the review layout.`,
    content: `## What it is

${s.name} is a fictional tool. ${s.blurb}

## Who it suits

This paragraph is placeholder text for the review layout. Replace it with your own testing notes.

## Verdict

No real product was tested. Delete this sample before publishing.`,
    author: "Sample (fictional)", published_at: day(-1), updated_at: day(-1), status: "published", seo_title: `${s.name} review (sample)`,
    post_type: "review", tool_id: id,
  });
}
for (const s of SAMPLES) {
  if (!s.deal) continue;
  const d = s.deal;
  put("Deals", {
    deal_id: d.id, tool_id: ids.get(s.name)!, title: d.title, coupon_code: d.code, discount: d.discount,
    expires_at: d.days === null ? "" : day(d.days), verification_status: d.verified ? "verified" : "unverified",
    publish_status: "preview", created_at: stamp, updated_at: day(-2),
  });
}
writeFileSync("local-data/design-preview.json", JSON.stringify(book, null, 2));
console.log(`Wrote local-data/design-preview.json: ${book.Tools!.length - 1} tools, ${book.Deals!.length - 1} fictional deals (one already expired, for the expired state)`);
