import "server-only";
import { readFile } from "node:fs/promises";
import { adaptNormalized, emptyNormalized, type NormalizedRaw } from "@/data/normalized/adapt";
import { NORMALIZED_TABS } from "@/data/normalized/schema";
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
    const ranges = NORMALIZED_TABS.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join("&");
    const res = await this.request(
      `${this.base()}/values:batchGet?${ranges}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      token,
      { left: 3 },
    );
    if (res.status === 400) throw new SheetsRequestError("invalid", "The Sheet does not have all 8 AI-directory tabs (see README)", 400);
    if (!res.ok) throw await this.failure(res);
    const data = (await res.json().catch(() => {
      throw new SheetsRequestError("invalid", "Google Sheets returned a response that is not JSON");
    })) as { valueRanges?: { values?: unknown[][] }[] };
    if (!Array.isArray(data.valueRanges)) throw new SheetsRequestError("invalid", "Google Sheets response has no valueRanges");
    const raw = emptyNormalized();
    NORMALIZED_TABS.forEach((t, i) => { raw[t] = cells(data.valueRanges?.[i]?.values); });
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

