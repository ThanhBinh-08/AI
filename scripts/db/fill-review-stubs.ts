/**
 * Completes Blog_Posts rows that only have a source_url (one per tool): the tool is found through Tools.source_url
 * and the empty cells of that row are filled so the row is a valid, DRAFT review stub:
 *   post_id = REV-<tool_id>, title = "<name> review", slug = "<tool slug>-review", status = draft,
 *   post_type = review, tool_id = <tool_id>.
 * Nothing the row already holds is changed, no review text is written (that is yours), rows without a match are
 * left alone and listed. Idempotent.
 *
 *   npm run db:fill-reviews              dry run
 *   npm run db:fill-reviews -- --apply   write, read back, validate
 */
import { JWT } from "google-auth-library";
import { checkIntegrity, emptyNormalized, records, type NormalizedRaw } from "../../src/data/normalized/adapt";
import { NORMALIZED_TABS } from "../../src/data/normalized/schema";

const APPLY = process.argv.includes("--apply");
const letter = (i: number) => String.fromCharCode(65 + i);

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

  const sheet = await read();
  const header = sheet.Blog_Posts[0] ?? [];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Blog_Posts has no ${name} column; run npm run db:migrate -- --apply first`);
    return i;
  };
  const toolBySource = new Map(records(sheet.Tools).filter((t) => t.source_url).map((t) => [t.source_url!, t]));

  const data: { range: string; values: string[][] }[] = [];
  const merged = sheet.Blog_Posts.map((r) => [...r]);
  const unmatched: string[] = [];
  let eligible = 0;
  sheet.Blog_Posts.forEach((row, idx) => {
    if (idx === 0) return;
    const filled = row.map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
    if (filled.length !== 1 || filled[0] !== col("source_url")) return; // only rows that hold nothing but a source_url
    eligible++;
    const tool = toolBySource.get(row[col("source_url")]!.trim());
    if (!tool) { unmatched.push(`row ${idx + 1}: ${row[col("source_url")]}`); return; }
    const values: Record<string, string> = {
      post_id: `REV-${tool.tool_id}`, title: `${tool.name} review`, slug: `${tool.slug}-review`, status: "draft", post_type: "review", tool_id: tool.tool_id!,
    };
    const r = idx + 1;
    for (const [name, v] of Object.entries(values)) {
      data.push({ range: `'Blog_Posts'!${letter(col(name))}${r}`, values: [[v]] });
      while (merged[idx]!.length <= col(name)) merged[idx]!.push("");
      merged[idx]![col(name)] = v;
    }
  });

  const check = checkIntegrity({ ...sheet, Blog_Posts: merged });
  const before = checkIntegrity(sheet).issues.length;
  console.log(`Rows with only a source_url: ${eligible}; matched to a tool: ${eligible - unmatched.length}; unmatched: ${unmatched.length}`);
  for (const u of unmatched.slice(0, 10)) console.log(`  unmatched ${u}`);
  console.log(`Integrity issues before ${before}, after ${check.issues.length}`);
  for (const i of check.issues.slice(0, 15)) console.log(`  ISSUE ${i.tab}#${i.row}: ${i.message}`);
  if (check.issues.length > 0) throw new Error("result would not be valid; nothing written");
  if (!APPLY) { console.log("Dry run only. Add --apply to write."); return; }
  if (data.length === 0) { console.log("Nothing to fill."); return; }

  for (let i = 0; i < data.length; i += 400) {
    const res = await fetch(`${base}/values:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ valueInputOption: "RAW", data: data.slice(i, i + 400) }) });
    if (!res.ok) throw new Error(`write failed (${res.status})`);
  }
  const back = await read();
  const issues = checkIntegrity(back).issues;
  const posts = records(back.Blog_Posts);
  const reviews = posts.filter((p) => p.post_type === "review");
  console.log(`Read back: ${posts.length} posts (${reviews.length} reviews, ${reviews.filter((p) => p.status === "draft").length} draft); integrity issues ${issues.length}`);
  for (const i of issues.slice(0, 15)) console.log(`  ISSUE ${i.tab}#${i.row}: ${i.message}`);
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
