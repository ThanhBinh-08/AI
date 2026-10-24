/**
 * Imports local-data/toolify-sample.json as PREVIEW rows (idempotent, append-only, never overwrites).
 *
 *   npm run db:import                                 dry run against the Sheet (needs GOOGLE_SHEET_ID + service account Editor)
 *   npm run db:import -- --apply                      append to the Sheet, read back, validate
 *   npm run db:import -- --local local-data/normalized.json [--apply]    same, against a local workbook JSON
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { JWT } from "google-auth-library";
import { emptyNormalized, type NormalizedRaw } from "../../src/data/normalized/adapt";
import { applyPlan, integrityIssues, planImport, type CrawledInput } from "../../src/data/normalized/import";
import { CATEGORY_SEED, HEADERS, NORMALIZED_TABS, SETTINGS_SEED } from "../../src/data/normalized/schema";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const APPLY = args.includes("--apply");
const LOCAL = opt("--local");
const SAMPLE = opt("--sample") ?? "local-data/toolify-sample.json";

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
  if (!res.ok) throw new Error(`read failed (${res.status}); is the spreadsheet shared with the service account as Editor, with all 8 tabs?`);
  const data = (await res.json()) as { valueRanges: { values?: unknown[][] }[] };
  const raw = emptyNormalized();
  NORMALIZED_TABS.forEach((t, i) => { raw[t] = (data.valueRanges[i]?.values ?? []).map((r) => r.map((c) => String(c ?? ""))); });
  return raw;
}

function localWorkbook(file: string): NormalizedRaw {
  const raw = emptyNormalized();
  if (existsSync(file)) {
    const j = JSON.parse(readFileSync(file, "utf8")) as Record<string, string[][]>;
    for (const t of NORMALIZED_TABS) raw[t] = j[t] ?? [];
  }
  if (raw.Categories.length === 0) raw.Categories = [[...HEADERS.Categories], ...CATEGORY_SEED.map((c, i) => [c.id, c.name, c.slug, c.description, "", String(i + 1), "active", "", ""])];
  if (raw.Settings.length === 0) raw.Settings = [[...HEADERS.Settings], ...SETTINGS_SEED.map((s) => [s.key, s.value, s.description, ""])];
  return raw;
}

async function main() {
  if (!existsSync(SAMPLE)) throw new Error(`${SAMPLE} not found: run npm run db:crawl first (the last crawl was blocked with HTTP 403 if this file is missing)`);
  const crawl = JSON.parse(readFileSync(SAMPLE, "utf8")) as { tools: CrawledInput[] };
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!LOCAL && !sheetId) throw new Error("GOOGLE_SHEET_ID is empty; pass --local <file> or set the id of the AI directory spreadsheet");
  const tk = LOCAL ? "" : await token();
  const existing = LOCAL ? localWorkbook(LOCAL) : await readSheet(sheetId!, tk);

  const before = integrityIssues(existing);
  const plan = planImport(existing, crawl.tools);
  const merged = applyPlan(existing, plan);
  const after = integrityIssues(merged);
  const introduced = after.filter((a) => !before.some((b) => b.tab === a.tab && b.row === a.row && b.message === a.message));
  console.log(`Dry-run summary: discovered ${crawl.tools.length}, would insert ${plan.inserted}, skipped ${plan.skipped.length}, failed ${plan.failed.length}, new integrity issues ${introduced.length}`);
  for (const s of plan.skipped) console.log(`  skip ${s.handle}: ${s.reason}`);
  for (const f of plan.failed) console.log(`  FAIL ${f.handle}: ${f.reason}`);
  for (const i of introduced) console.log(`  ISSUE ${i.tab}#${i.row}: ${i.message}`);
  if (introduced.length > 0) throw new Error("import would introduce integrity issues; nothing written");
  if (!APPLY) { console.log("Dry run only. Add --apply to write."); return; }

  if (LOCAL) {
    mkdirSync(dirname(LOCAL), { recursive: true });
    writeFileSync(LOCAL, JSON.stringify(merged, null, 2));
    console.log(`Wrote ${LOCAL}`);
  } else {
    for (const [tab, rows] of Object.entries(plan.append)) {
      if (!rows?.length) continue;
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: rows }),
      });
      if (!res.ok) throw new Error(`append to ${tab} failed (${res.status})`);
    }
  }
  // Read back and validate what is now stored.
  const back = LOCAL ? localWorkbook(LOCAL) : await readSheet(sheetId!, tk);
  const issues = integrityIssues(back);
  console.log(`Read back: ${back.Tools.length - 1} tools, ${back.Tool_Categories.length - 1} tool-category rows; integrity issues: ${issues.length}`);
  for (const i of issues) console.log(`  ISSUE ${i.tab}#${i.row}: ${i.message}`);
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
