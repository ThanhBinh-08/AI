/** Writes a FICTIONAL workbook in the normalized layout for local layout tests: npm run db:sample -> local-data/sample-normalized.json */
import { mkdirSync, writeFileSync } from "node:fs";
import { CATEGORY_SEED, HEADERS, NORMALIZED_TABS, SETTINGS_SEED, type NormalizedTab } from "../../src/data/normalized/schema";

const stamp = "2026-10-23T00:00:00.000Z";
const rows: Record<NormalizedTab, Record<string, string>[]> = Object.fromEntries(NORMALIZED_TABS.map((t) => [t, []])) as never;
rows.Categories = CATEGORY_SEED.map((c, i) => ({ category_id: c.id, category_name: c.name, slug: c.slug, description: c.description, display_order: String(i + 1), status: "active", created_at: stamp, updated_at: stamp }));
rows.Settings = SETTINGS_SEED.map((s) => ({ setting_key: s.key, setting_value: s.value, description: s.description, updated_at: stamp }));
CATEGORY_SEED.forEach((c, i) => {
  for (const n of [1, 2]) {
    const id = `T${String(i * 2 + n).padStart(4, "0")}`;
    const name = `Sample ${c.name.replace(/^AI /, "")} Tool ${n}`;
    rows.Tools.push({ tool_id: id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), short_description: `Fictional ${c.name.toLowerCase()} placeholder for layout testing.`, official_url: `https://sample-${id.toLowerCase()}.example.com`, pricing_model: "unknown", source_name: "Fictional sample", data_source_type: "preview_import", verification_status: "unverified", publish_status: "preview", featured: "FALSE", display_order: String(i * 2 + n), imported_at: stamp, created_at: stamp, updated_at: stamp });
    rows.Tool_Categories.push({ tool_category_id: `TC-${id}-${c.id}`, tool_id: id, category_id: c.id, is_primary: "TRUE", created_at: stamp });
  }
});
rows.Tool_Alternatives.push({ alternative_id: "ALT0001", tool_id: "T0001", alternative_tool_id: "T0002", relationship_type: "alternative", display_order: "1", created_at: stamp });
const out = Object.fromEntries(NORMALIZED_TABS.map((t) => [t, [[...HEADERS[t]], ...rows[t].map((r) => HEADERS[t].map((h) => r[h] ?? ""))]]));
mkdirSync("local-data", { recursive: true });
writeFileSync("local-data/sample-normalized.json", JSON.stringify(out, null, 2));
console.log(`Wrote local-data/sample-normalized.json (${rows.Tools.length} fictional tools)`);
