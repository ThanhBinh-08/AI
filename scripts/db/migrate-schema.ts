/**
 * Brings an existing AI-directory spreadsheet up to the current schema. Idempotent, never deletes or rewrites data.
 *   - appends missing header cells (Blog_Posts: post_type, tool_id) after the last used column;
 *   - sets dropdowns: controlled values (post_type...) and foreign keys (tool_id picks from Tools.tool_id,
 *     category_id from Categories.category_id, ...), so a wrong key cannot be typed in the Sheet.
 *
 *   npm run db:migrate              dry run
 *   npm run db:migrate -- --apply   write
 */
import { JWT } from "google-auth-library";
import { ENUMS, FOREIGN_KEYS, HEADERS, NORMALIZED_TABS, type NormalizedTab } from "../../src/data/normalized/schema";

const APPLY = process.argv.includes("--apply");
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

async function main() {
  const id = process.env.GOOGLE_SHEET_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  if (!id || !email || !key) throw new Error("GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY missing");
  const tk = (await new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }).getAccessToken()).token!;
  const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;

  const meta = (await (await fetch(`${base}?fields=sheets.properties(sheetId,title)`, { headers: h })).json()) as { sheets: { properties: { sheetId: number; title: string } }[] };
  const sheetIds = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const ranges = NORMALIZED_TABS.map((t) => `ranges=${encodeURIComponent(`'${t}'!1:1`)}`).join("&");
  const heads = (await (await fetch(`${base}/values:batchGet?${ranges}`, { headers: h })).json()) as { valueRanges: { values?: string[][] }[] };
  const header = new Map<NormalizedTab, string[]>(NORMALIZED_TABS.map((t, i) => [t, heads.valueRanges[i]?.values?.[0] ?? []]));

  const data: { range: string; values: string[][] }[] = [];
  const requests: unknown[] = [];
  for (const tab of NORMALIZED_TABS) {
    if (!sheetIds.has(tab)) throw new Error(`tab ${tab} is missing; run db:create --into first`);
    const have = header.get(tab)!;
    const missing = HEADERS[tab].filter((c) => !have.includes(c));
    if (have.length === 0) throw new Error(`tab ${tab} has no header row`);
    if (missing.length > 0) {
      data.push({ range: `'${tab}'!${letter(have.length)}1`, values: [missing] });
      console.log(`+ ${tab}: add column(s) ${missing.join(", ")} at ${letter(have.length)}1`);
      header.set(tab, [...have, ...missing]);
    }
  }
  const col = (tab: NormalizedTab, name: string) => header.get(tab)!.indexOf(name);
  for (const tab of NORMALIZED_TABS) {
    const sheetId = sheetIds.get(tab)!;
    for (const [column, allowed] of Object.entries(ENUMS[tab] ?? {})) {
      const c = col(tab, column);
      if (c < 0) continue;
      requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: allowed.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true } } });
    }
  }
  for (const fk of FOREIGN_KEYS) {
    const [tab, column] = fk.from;
    const [toTab, toCol] = fk.to;
    const c = col(tab, column);
    const t = col(toTab, toCol);
    if (c < 0 || t < 0) continue;
    const L = letter(t);
    requests.push({
      setDataValidation: {
        range: { sheetId: sheetIds.get(tab)!, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
        rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='${toTab}'!$${L}$2:$${L}` }] }, strict: true, showCustomUi: true },
      },
    });
  }
  const note = (column: string, text: string) =>
    requests.push({
      updateCells: {
        range: { sheetId: sheetIds.get("Blog_Posts")!, startRowIndex: 0, endRowIndex: 1, startColumnIndex: col("Blog_Posts", column), endColumnIndex: col("Blog_Posts", column) + 1 },
        rows: [{ values: [{ note: text }] }],
        fields: "note",
      },
    });
  note("tool_id", "FOREIGN KEY → Tools.tool_id. A review (post_type=review) needs this or source_url; one review per tool. Suggested post_id: REV-<tool_id>.");
  note("source_url", "FOREIGN KEY → Tools.source_url (pick from the list). Names the tool being reviewed; if tool_id is also filled it must be the same tool. Leave empty for posts that are not about one tool.");
  note("post_type", "review, guide or comparison.");
  console.log(`+ dropdowns: ${requests.length - 3} (controlled values and foreign keys), 3 header notes`);
  if (!APPLY) { console.log("Dry run only. Add --apply to write."); return; }

  if (data.length > 0) {
    const r = await fetch(`${base}/values:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ valueInputOption: "RAW", data }) });
    if (!r.ok) throw new Error(`header update failed (${r.status})`);
  }
  const r = await fetch(`${base}:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ requests }) });
  if (!r.ok) throw new Error(`validation update failed (${r.status}): ${((await r.json()) as { error?: { message?: string } }).error?.message ?? ""}`);
  console.log("Migrated.");
}

main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
