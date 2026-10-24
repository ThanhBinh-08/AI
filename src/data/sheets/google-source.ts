import "server-only";
import { JWT } from "google-auth-library";
import { getGoogleEnv, type GoogleEnv } from "@/lib/env";
import { isNextDynamicUsage, SheetsRequestError, shortMessage } from "./errors";
import { emptyTabs, tabForTitle, TAB_NAMES, type RawTabs, type SheetSource, type TabName } from "./source";

type TokenProvider = () => Promise<string>;

function jwtTokenProvider(env: GoogleEnv): TokenProvider {
  const jwt = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY,
    // Read-only: the site never writes to the Sheet.
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return async () => {
    const { token } = await jwt.getAccessToken();
    if (!token) throw new Error("Google auth returned no access token");
    return token;
  };
}

/** Every HTTP attempt of one refresh counts, retries and the title lookup included. */
const MAX_REQUESTS = 4;
const RETRY_DELAYS_MS = [500, 1500];

/**
 * Reads all tabs with one values:batchGet call, server-side only, with the read-only scope.
 * Timeouts, network errors and 5xx are retried with jittered back-off; 429 and auth errors are not.
 * If a tab title is not found, the tabs are looked up by title (with aliases) and missing tabs read as empty.
 */
export class GoogleSheetsSource implements SheetSource {
  readonly kind = "sheets" as const;

  constructor(
    private readonly env: GoogleEnv = getGoogleEnv(),
    private readonly fetchImpl: typeof fetch = fetch,
    protected readonly getToken: TokenProvider = jwtTokenProvider(env),
    private readonly timeoutMs = 10_000,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  protected base(): string {
    return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.env.GOOGLE_SHEET_ID)}`;
  }

  protected async failure(res: Response): Promise<SheetsRequestError> {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const message = `Google Sheets request failed (${res.status}): ${shortMessage(new Error(body?.error?.message ?? res.statusText))}`;
    if (res.status === 429) return new SheetsRequestError("quota", message, 429);
    if (res.status === 401 || res.status === 403) return new SheetsRequestError("auth", message, res.status);
    return new SheetsRequestError("http", message, res.status);
  }

  protected async request(url: string, token: string, budget: { left: number }): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (budget.left-- <= 0) throw new SheetsRequestError("http", "Google Sheets request budget for one refresh is used up");
      const signal = AbortSignal.timeout(this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
      } catch (cause) {
        if (isNextDynamicUsage(cause)) throw cause;
        if (attempt < RETRY_DELAYS_MS.length) {
          await this.sleep(RETRY_DELAYS_MS[attempt]! * (0.75 + Math.random() * 0.5));
          continue;
        }
        throw signal.aborted
          ? new SheetsRequestError("timeout", `Google Sheets request timed out after ${this.timeoutMs}ms`)
          : new SheetsRequestError("network", `Google Sheets request failed: ${shortMessage(cause)}`);
      }
      if (res.ok || res.status === 400) return res;
      const transient = res.status === 408 || res.status >= 500;
      if (transient && attempt < RETRY_DELAYS_MS.length) {
        await this.sleep(RETRY_DELAYS_MS[attempt]! * (0.75 + Math.random() * 0.5));
        continue;
      }
      throw await this.failure(res);
    }
  }

  private async lookupTitles(token: string, budget: { left: number }): Promise<[TabName, string][]> {
    const res = await this.request(`${this.base()}?fields=sheets.properties.title`, token, budget);
    if (!res.ok) throw await this.failure(res);
    const data = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
    const found: [TabName, string][] = [];
    for (const s of data.sheets ?? []) {
      const title = s.properties?.title;
      const tab = title ? tabForTitle(title) : undefined;
      if (tab && title && !found.some(([t]) => t === tab)) found.push([tab, title]);
    }
    return found;
  }

  private batchGet(tabs: [TabName, string][], token: string, budget: { left: number }): Promise<Response> {
    const ranges = tabs.map(([, title]) => `ranges=${encodeURIComponent(`'${title.replace(/'/g, "''")}'`)}`).join("&");
    return this.request(
      `${this.base()}/values:batchGet?${ranges}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
      token,
      budget,
    );
  }

  async fetchTabs(): Promise<RawTabs> {
    let token: string;
    try {
      token = await this.getToken();
    } catch (cause) {
      throw new SheetsRequestError("auth", `Google auth failed: ${shortMessage(cause)}`);
    }
    const budget = { left: MAX_REQUESTS };
    let wanted: [TabName, string][] = TAB_NAMES.map((t) => [t, t]);
    let res = await this.batchGet(wanted, token, budget);
    if (res.status === 400) {
      wanted = await this.lookupTitles(token, budget);
      const missing = TAB_NAMES.filter((t) => !wanted.some(([k]) => k === t));
      if (missing.length > 0) console.error(`[data] Sheet tabs not found, read as empty: ${missing.join(", ")}`);
      if (wanted.length === 0) return emptyTabs();
      res = await this.batchGet(wanted, token, budget);
    }
    if (!res.ok) throw await this.failure(res);
    const data = (await res.json().catch(() => {
      throw new SheetsRequestError("invalid", "Google Sheets returned a response that is not JSON");
    })) as { valueRanges?: { values?: unknown[][] }[] };
    if (!Array.isArray(data.valueRanges)) throw new SheetsRequestError("invalid", "Google Sheets response has no valueRanges");
    const tabs = emptyTabs();
    wanted.forEach(([name], i) => {
      tabs[name] = (data.valueRanges?.[i]?.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
    });
    return tabs;
  }
}
