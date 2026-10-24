/**
 * Appends the FICTIONAL design samples (local-data/design-preview.json) to the Google Sheet so the site can be
 * designed with realistic tools and deals. Append-only, idempotent by tool_id / deal_id, validated before and after.
 *
 *   npm run db:push-samples              dry run
 *   npm run db:push-samples -- --apply   write, read back, validate
 *
 * Everything added is publish_status=preview and easy to find for deletion:
 *   Tools:           source_name = "Fictional sample"   (also their Tool_Categories rows: tool_category_id TC-<tool_id>-...)
 *   Deals:           deal_id starts with DSMP
 *   Blog_Posts:      author = "Sample (fictional)"   (post_id REV-<tool_id>)
 */
import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";
import { checkIntegrity, emptyNormalized, records, type NormalizedRaw } from "../../src/data/normalized/adapt";
import { HEADERS, NORMALIZED_TABS, type NormalizedTab } from "../../src/data/normalized/schema";

const APPLY = process.argv.includes("--apply");
const FILE = "local-data/design-preview.json";

async function token(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY missing");
  const t = (await new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }).getAccessToken()).token;
  if (!t) throw new Error("no token");
  return t;
}

async function readSheet(id: string, tk: string): Promise<NormalizedRaw> {
  const ranges = NORMALIZED_TABS.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join("&");
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${tk}` } });
  if (!res.ok) throw new Error(`read failed (${res.status})`);
  const data = (await res.json()) as { valueRanges: { values?: unknown[][] }[] };
  const raw = emptyNormalized();
  NORMALIZED_TABS.forEach((t, i) => { raw[t] = (data.valueRanges[i]?.values ?? []).map((r) => r.map((c) => String(c ?? ""))); });
  return raw;
}

/** Rows of `tab` in the local file whose key column value is not yet in the Sheet and that pass `keep`. */
function newRows(tab: NormalizedTab, key: string, local: NormalizedRaw, sheet: NormalizedRaw, keep: (r: Record<string, string>) => boolean): string[][] {
  const have = new Set(records(sheet[tab]).map((r) => r[key]));
  const header = local[tab][0]!;
  return records(local[tab]).filter((r) => keep(r) && !have.has(r[key])).map((r) => header.map((h) => r[h] ?? ""));
}

async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is empty");
  const tk = await token();
  const local = JSON.parse(readFileSync(FILE, "utf8")) as NormalizedRaw;
  const sheet = await readSheet(sheetId, tk);

  const isSample = (r: Record<string, string>) => r.source_name === "Fictional sample";
  const sampleIds = new Set(records(local.Tools).filter(isSample).map((r) => r.tool_id));
  const plan: Partial<Record<NormalizedTab, string[][]>> = {
    Tools: newRows("Tools", "tool_id", local, sheet, isSample),
    Tool_Categories: newRows("Tool_Categories", "tool_category_id", local, sheet, (r) => sampleIds.has(r.tool_id!)),
    Deals: newRows("Deals", "deal_id", local, sheet, (r) => (r.deal_id ?? "").startsWith("DSMP")),
    Blog_Posts: newRows("Blog_Posts", "post_id", local, sheet, (r) => r.author === "Sample (fictional)"),
  };
  const merged = { ...sheet } as NormalizedRaw;
  for (const [tab, rows] of Object.entries(plan) as [NormalizedTab, string[][]][]) merged[tab] = [...(sheet[tab].length ? sheet[tab] : [[...HEADERS[tab]]]), ...rows];

  const before = checkIntegrity(sheet).issues.length;
  const after = checkIntegrity(merged).issues;
  console.log(`Plan: +${plan.Tools!.length} tools, +${plan.Tool_Categories!.length} tool-category rows, +${plan.Deals!.length} deals, +${plan.Blog_Posts!.length} posts. Integrity issues before ${before}, after ${after.length}`);
  for (const i of after) console.log(`  ISSUE ${i.tab}#${i.row}: ${i.message}`);
  if (after.length > before) throw new Error("would introduce integrity issues; nothing written");
  if (!APPLY) { console.log("Dry run only. Add --apply to write."); return; }

  for (const [tab, rows] of Object.entries(plan) as [NormalizedTab, string[][]][]) {
    if (rows.length === 0) continue;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: rows }),
    });
    if (!res.ok) throw new Error(`append to ${tab} failed (${res.status})`);
  }
  const back = await readSheet(sheetId, tk);
  const issues = checkIntegrity(back).issues;
  const samples = records(back.Tools).filter(isSample).length;
  const deals = records(back.Deals).filter((r) => (r.deal_id ?? "").startsWith("DSMP")).length;
  console.log(`Read back: ${back.Tools.length - 1} tools (${samples} fictional), ${back.Tool_Categories.length - 1} tool-category rows, ${deals} fictional deals; integrity issues ${issues.length}`);
  for (const i of issues) console.log(`  ISSUE ${i.tab}#${i.row}: ${i.message}`);
  if (issues.length > 0 || samples !== plan.Tools!.length + (records(sheet.Tools).filter(isSample).length)) process.exitCode = 1;
}

main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
