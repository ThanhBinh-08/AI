import "server-only";
import { readFile } from "node:fs/promises";
import { adaptNormalized, emptyNormalized, type NormalizedRaw } from "@/data/normalized/adapt";
import { NORMALIZED_TABS, OPTIONAL_TABS } from "@/data/normalized/schema";
import { previewRecordsAllowed } from "@/lib/env";
import type { Issue } from "@/types/catalog";
import { SheetsRequestError, shortMessage } from "./errors";
import { GoogleSheetsSource } from "./google-source";
import type { RawTabs, SheetSource } from "./source";

const cells = (rows: unknown[][] | undefined) => (rows ?? []).map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));

/** Reads the 8-tab AI-directory layout from Google Sheets (read-only scope, one batchGet) and adapts it. */
export class NormalizedGoogleSource extends GoogleSheetsSource {
  adapterIssues: readonly Issue[] = [];

  async fetchTabs(): Promise<RawTabs> {
    const token = await this.getToken().catch((cause: unknown) => {
      throw new SheetsRequestError("auth", `Google auth failed: ${shortMessage(cause)}`);
    });
    // Which tabs exist: optional tabs (OPTIONAL_TABS) may be gone, required ones may not.
    const metaRes = await this.request(`${this.base()}?fields=sheets.properties.title`, token, { left: 3 });
    if (!metaRes.ok) throw await this.failure(metaRes);
    const meta = (await metaRes.json().catch(() => null)) as { sheets?: { properties?: { title?: string } }[] } | null;
    const titles = new Set((meta?.sheets ?? []).map((s) => s.properties?.title ?? ""));
    const missing = NORMALIZED_TABS.filter((t) => !titles.has(t) && !OPTIONAL_TABS.includes(t));
    if (missing.length > 0) throw new SheetsRequestError("invalid", `The Sheet is missing required tab(s): ${missing.join(", ")} (see README)`, 400);
    const present = NORMALIZED_TABS.filter((t) => titles.has(t));

    const ranges = present.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join("&");
    const res = await this.request(
      `${this.base()}/values:batchGet?${ranges}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      token,
      { left: 3 },
    );
    if (res.status === 400) throw new SheetsRequestError("invalid", "The Sheet tabs could not be read (see README)", 400);
    if (!res.ok) throw await this.failure(res);
    const data = (await res.json().catch(() => {
      throw new SheetsRequestError("invalid", "Google Sheets returned a response that is not JSON");
    })) as { valueRanges?: { values?: unknown[][] }[] };
    if (!Array.isArray(data.valueRanges)) throw new SheetsRequestError("invalid", "Google Sheets response has no valueRanges");
    const raw = emptyNormalized();
    present.forEach((t, i) => { raw[t] = cells(data.valueRanges?.[i]?.values); });
    const out = adaptNormalized(raw, { allowPreview: previewRecordsAllowed() });
    this.adapterIssues = out.issues;
    return out.tabs;
  }
}

/** Local workbook JSON ({ "<tab>": [[header], [row]...] }) for localhost previews. Never used on a real domain. */
export class LocalNormalizedSource implements SheetSource {
  readonly kind = "fixture" as const;
  adapterIssues: readonly Issue[] = [];
  constructor(private readonly file: string) {}

  async fetchTabs(): Promise<RawTabs> {
    const json = JSON.parse(await readFile(this.file, "utf8")) as Record<string, unknown[][]>;
    const raw = emptyNormalized();
    for (const t of NORMALIZED_TABS) raw[t as keyof NormalizedRaw] = cells(json[t]);
    const out = adaptNormalized(raw, { allowPreview: previewRecordsAllowed() });
    this.adapterIssues = out.issues;
    return out.tabs;
  }
}

