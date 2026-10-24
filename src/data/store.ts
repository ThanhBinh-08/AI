import "server-only";
import { hasGoogleEnv, isLocalSite, usesNormalizedLayout } from "@/lib/env";
import { parseCatalog, type ParsedCatalog } from "@/data/schemas/parse";
import { CatalogUnavailableError, errorCode, isNextDynamicUsage, shortMessage, type SheetsErrorCode } from "@/data/sheets/errors";
import { FixtureSource } from "@/data/sheets/fixture-source";
import { GoogleSheetsSource } from "@/data/sheets/google-source";
import { LocalNormalizedSource, NormalizedGoogleSource } from "@/data/sheets/normalized-source";
import { EmptySource, type SheetSource } from "@/data/sheets/source";

/**
 * Picks the data source:
 * - DATA_SOURCE=fixture → sample data, only when NEXT_PUBLIC_SITE_URL is localhost;
 * - DATA_SOURCE=local-json + LOCAL_DATA_FILE → normalized workbook JSON from disk, localhost only;
 * - GOOGLE_* set → Google Sheets (SHEET_LAYOUT=normalized for the 8-tab AI-directory layout);
 * - otherwise → no data (pages show their empty states).
 */
export function createSource(env: NodeJS.ProcessEnv = process.env): SheetSource {
  const wanted = env.DATA_SOURCE?.trim().toLowerCase();
  if (wanted === "fixture") {
    if (isLocalSite(env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3400")) return new FixtureSource();
    console.error("[data] DATA_SOURCE=fixture ignored: sample data is only allowed on a localhost site URL");
  }
  if (wanted === "local-json") {
    if (isLocalSite(env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3400") && env.LOCAL_DATA_FILE?.trim()) return new LocalNormalizedSource(env.LOCAL_DATA_FILE.trim());
    console.error("[data] DATA_SOURCE=local-json ignored: needs LOCAL_DATA_FILE and a localhost site URL");
  }
  if (hasGoogleEnv(env)) return usesNormalizedLayout(env) ? new NormalizedGoogleSource() : new GoogleSheetsSource();
  if (wanted === "sheets") console.error("[data] DATA_SOURCE=sheets but GOOGLE_* variables are missing; serving no data");
  return new EmptySource();
}

function ttlMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SHEET_CACHE_TTL_SECONDS);
  return (Number.isFinite(n) && n >= 30 && n <= 3600 ? n : 300) * 1000;
}

interface State {
  source: SheetSource;
  data: ParsedCatalog | null;
  loadedAt: number;
  inflight: Promise<ParsedCatalog> | null;
  lastError: { code: SheetsErrorCode; message: string; at: number } | null;
  /** No new attempt before this time after a failure, so a broken Sheet is not hammered. */
  retryAfter: number;
}

// One store per server process, shared by every bundle Next creates.
const KEY = Symbol.for("ai-deals.catalog-store");
const g = globalThis as unknown as { [KEY]?: State };

function state(): State {
  g[KEY] ??= { source: createSource(), data: null, loadedAt: 0, inflight: null, lastError: null, retryAfter: 0 };
  return g[KEY];
}

/** Tests only. */
export function resetStore(source?: SheetSource): void {
  g[KEY] = { source: source ?? createSource(), data: null, loadedAt: 0, inflight: null, lastError: null, retryAfter: 0 };
}

async function refresh(s: State): Promise<ParsedCatalog> {
  const startedAt = Date.now();
  try {
    const parsed = parseCatalog(await s.source.fetchTabs());
    if (s.source.adapterIssues?.length) parsed.catalog.issues.unshift(...s.source.adapterIssues);
    s.data = parsed;
    s.loadedAt = Date.now();
    s.lastError = null;
    if (parsed.catalog.issues.length > 0) {
      console.warn(`[data] ${parsed.catalog.issues.length} Sheet issue(s); see /api/health/ for the list`);
    }
    console.info(`[data] catalog loaded from ${s.source.kind} in ${Date.now() - startedAt}ms`);
    return parsed;
  } catch (err) {
    if (isNextDynamicUsage(err)) throw err; // not a Sheet failure: let Next render this route per request
    const code = errorCode(err);
    s.lastError = { code, message: shortMessage(err), at: Date.now() };
    // Quota and auth problems do not fix themselves in seconds.
    s.retryAfter = Date.now() + (code === "quota" || code === "auth" ? 300_000 : 30_000);
    console.error(`[data] catalog refresh failed (${code}): ${shortMessage(err)}`);
    if (s.data) return s.data; // stale-if-error: keep serving the last good catalog
    throw new CatalogUnavailableError(code, "The catalog could not be loaded");
  } finally {
    s.inflight = null;
  }
}

/** The current catalog: cached for SHEET_CACHE_TTL_SECONDS, one refresh at a time, last good copy on errors. */
export async function getParsedCatalog(): Promise<ParsedCatalog> {
  const s = state();
  const fresh = s.data && Date.now() - s.loadedAt < ttlMs();
  if (fresh) return s.data!;
  if (s.data && Date.now() < s.retryAfter) return s.data;
  if (!s.data && s.lastError && Date.now() < s.retryAfter) throw new CatalogUnavailableError(s.lastError.code, "The catalog could not be loaded");
  s.inflight ??= refresh(s);
  return s.inflight;
}

/** Drops the cache so the next read goes to the source (used by POST /api/revalidate/). */
export async function forceRefresh(): Promise<void> {
  const s = state();
  s.loadedAt = 0;
  s.retryAfter = 0;
  await getParsedCatalog();
}

export function storeHealth() {
  const s = state();
  return {
    source: s.source.kind,
    loadedAt: s.loadedAt ? new Date(s.loadedAt).toISOString() : null,
    lastError: s.lastError ? { code: s.lastError.code, at: new Date(s.lastError.at).toISOString() } : null,
    issues: s.data?.catalog.issues ?? [],
  };
}
