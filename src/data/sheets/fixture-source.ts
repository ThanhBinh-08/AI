import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { emptyTabs, tabForTitle, type RawTabs, type SheetSource } from "./source";

/**
 * Sample workbook for local work and tests (tests/fixtures/sheet.json). Its brands are fictional and marked
 * as samples. `createSource` refuses it unless the site URL is localhost, so it can never reach a real domain.
 */
export class FixtureSource implements SheetSource {
  readonly kind = "fixture" as const;
  constructor(private readonly file = path.join(process.cwd(), "tests", "fixtures", "sheet.json")) {}

  async fetchTabs(): Promise<RawTabs> {
    const data = JSON.parse(await readFile(this.file, "utf8")) as Record<string, unknown[][]>;
    const tabs = emptyTabs();
    for (const [title, rows] of Object.entries(data)) {
      const tab = tabForTitle(title);
      if (tab) tabs[tab] = rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
    }
    return tabs;
  }
}
