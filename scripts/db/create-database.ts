/**
 * Creates the dedicated AI-directory spreadsheet (8 tabs, headers, dropdowns, seed categories/settings).
 *
 *   npm run db:create -- --create [--name "..."] [--share-with you@gmail.com]   new spreadsheet owned by the service account
 *   npm run db:create -- --create --into <spreadsheetId>                         set up an EMPTY spreadsheet you created
 *
 * Without --create it only prints what it would do. --into refuses to touch a spreadsheet that already has data in
 * any of the tabs (it never overwrites). Credentials are never printed. Afterwards put the id into GOOGLE_SHEET_ID
 * yourself (this script does not edit .env files).
 */
import { JWT } from "google-auth-library";
import { CATEGORY_SEED, ENUMS, HEADERS, NORMALIZED_TABS, SETTINGS_SEED, type NormalizedTab } from "../../src/data/normalized/schema";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const NAME = opt("--name") ?? "AI Directory Database — Preview and Production";
const SHARE_WITH = opt("--share-with");
const INTO = opt("--into");

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set (.env.local)");
  return { email, key };
}

async function api(token: string, url: string, body: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } } & Record<string, unknown>;
  if (!res.ok) throw new Error(`${url.split("?")[0]} → ${res.status} ${json.error?.status ?? ""}: ${json.error?.message ?? res.statusText}`);
  return json;
}

async function main() {
  console.log(`Spreadsheet: "${NAME}"`);
  console.log(`Tabs: ${NORMALIZED_TABS.join(", ")}`);
  console.log(`Seed: ${CATEGORY_SEED.length} categories, ${SETTINGS_SEED.length} settings; share with: ${SHARE_WITH ?? "(nobody)"}`);
  if (!flag("--create")) {
    console.log("Dry run. Add --create to create the spreadsheet.");
    return;
  }
  const { email, key } = credentials();
  const jwt = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
  });
  const token = (await jwt.getAccessToken()).token;
  if (!token) throw new Error("Google auth returned no token");

  let id: string;
  let url: string;
  let sheetIds: Map<string, number>;
  if (INTO) {
    id = INTO;
    const get = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetUrl,sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!get.ok) throw new Error(`cannot open spreadsheet (${get.status}); share it with ${email} as Editor`);
    const meta = (await get.json()) as { spreadsheetUrl: string; sheets: { properties: { sheetId: number; title: string } }[] };
    url = meta.spreadsheetUrl;
    const ours = meta.sheets.filter((s) => (NORMALIZED_TABS as readonly string[]).includes(s.properties.title));
    for (const s of ours) {
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${s.properties.title}'!A1:A2`)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const v = ((await r.json()) as { values?: unknown[][] }).values ?? [];
      if (v.length > 0) throw new Error(`tab "${s.properties.title}" already has data; refusing to overwrite`);
    }
    const have = new Set(meta.sheets.map((s) => s.properties.title));
    const add = NORMALIZED_TABS.filter((t) => !have.has(t));
    if (add.length > 0) {
      await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
        requests: add.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
      });
    }
    const after = (await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()) as { sheets: { properties: { sheetId: number; title: string } }[] };
    sheetIds = new Map(after.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
    await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      requests: [...sheetIds.values()].map((sheetId) => ({
        updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" },
      })),
    });
  } else {
    const created = (await api(token, "https://sheets.googleapis.com/v4/spreadsheets", {
      properties: { title: NAME, locale: "en_US", timeZone: "Etc/UTC" },
      sheets: NORMALIZED_TABS.map((title, index) => ({
        properties: { title, index, gridProperties: { frozenRowCount: 1 } },
      })),
    })) as { spreadsheetId: string; spreadsheetUrl: string; sheets: { properties: { sheetId: number; title: string } }[] };
    id = created.spreadsheetId;
    url = created.spreadsheetUrl;
    sheetIds = new Map(created.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  }

  const now = new Date().toISOString();
  const values: { range: string; values: string[][] }[] = NORMALIZED_TABS.map((t) => ({
    range: `'${t}'!A1`,
    values: [[...HEADERS[t]]],
  }));
  values.push({
    range: "'Categories'!A2",
    values: CATEGORY_SEED.map((c, i) => [c.id, c.name, c.slug, c.description, "", String(i + 1), "active", now, now]),
  });
  values.push({ range: "'Settings'!A2", values: SETTINGS_SEED.map((s) => [s.key, s.value, s.description, now]) });
  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    valueInputOption: "RAW",
    data: values,
  });

  const requests: unknown[] = [];
  for (const tab of NORMALIZED_TABS) {
    const sheetId = sheetIds.get(tab)!;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.92, blue: 0.96 } } },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    });
    requests.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS[tab].length } } });
    for (const [column, allowed] of Object.entries(ENUMS[tab as NormalizedTab] ?? {})) {
      const c = HEADERS[tab].indexOf(column);
      requests.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
          rule: {
            condition: { type: "ONE_OF_LIST", values: allowed.map((v) => ({ userEnteredValue: v })) },
            strict: true,
            showCustomUi: true,
          },
        },
      });
    }
    // Plain-text cells keep ids such as T0001 and dates as typed.
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }
  // Header notes: which columns are keys.
  const notes: [NormalizedTab, string, string][] = [
    ["Tools", "tool_id", "PRIMARY KEY (T0001...). Never reuse or renumber: URLs and relationships depend on it."],
    ["Tools", "slug", "UNIQUE. Used in the page URL; keep it stable when replacing preview data."],
    ["Tools", "affiliate_url", "Fill only with a real, approved affiliate link. Empty = no affiliate CTA."],
    ["Tools", "publish_status", "preview rows are sample data and are hidden on production. Use published for real records."],
    ["Tool_Categories", "tool_id", "FOREIGN KEY → Tools.tool_id"],
    ["Tool_Categories", "category_id", "FOREIGN KEY → Categories.category_id"],
    ["Tool_Alternatives", "alternative_tool_id", "FOREIGN KEY → Tools.tool_id (must differ from tool_id)"],
    ["Deals", "tool_id", "FOREIGN KEY → Tools.tool_id"],
    ["Categories", "parent_category_id", "FOREIGN KEY → Categories.category_id (optional)"],
  ];
  for (const [tab, column, note] of notes) {
    requests.push({
      updateCells: {
        range: { sheetId: sheetIds.get(tab)!, startRowIndex: 0, endRowIndex: 1, startColumnIndex: HEADERS[tab].indexOf(column), endColumnIndex: HEADERS[tab].indexOf(column) + 1 },
        rows: [{ values: [{ note }] }],
        fields: "note",
      },
    });
  }
  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { requests });

  let shared = "no";
  if (SHARE_WITH) {
    await api(token, `https://www.googleapis.com/drive/v3/files/${id}/permissions?sendNotificationEmail=false`, {
      type: "user",
      role: "writer",
      emailAddress: SHARE_WITH,
    });
    shared = `Editor → ${SHARE_WITH}`;
  }

  console.log("\nCREATED");
  console.log(`URL: ${url}`);
  console.log(`ID : ${id}`);
  console.log(`Shared: ${shared}`);
  console.log(`Service account (owner, can read/write): ${email}`);
}

main().catch((e) => {
  console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
