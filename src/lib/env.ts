const GOOGLE_KEYS = ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"] as const;

export type GoogleEnv = Record<(typeof GOOGLE_KEYS)[number], string>;

export function hasGoogleEnv(source: NodeJS.ProcessEnv = process.env): boolean {
  return GOOGLE_KEYS.every((k) => Boolean(source[k]?.trim()));
}

/** Credentials to read the Sheet. Throws naming every missing key. Call lazily, never at import time. */
export function getGoogleEnv(source: NodeJS.ProcessEnv = process.env): GoogleEnv {
  const missing = GOOGLE_KEYS.filter((k) => !source[k]?.trim());
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}. See .env.example.`);
  const env = Object.fromEntries(GOOGLE_KEYS.map((k) => [k, source[k]!.trim()])) as GoogleEnv;
  env.GOOGLE_PRIVATE_KEY = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  return env;
}

/** Canonical origin without trailing slash. */
export function getSiteUrl(source: NodeJS.ProcessEnv = process.env): string {
  return (source.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3400").replace(/\/+$/, "");
}

export function isLocalSite(siteUrl: string = getSiteUrl()): boolean {
  try {
    const host = new URL(siteUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return true;
  }
}

/**
 * Search engines may index this deployment only on a real https origin that is not marked NOINDEX.
 * Staging, previews and local runs are always noindex.
 */
export function isIndexable(source: NodeJS.ProcessEnv = process.env): boolean {
  const site = getSiteUrl(source);
  if (source.NOINDEX?.trim() === "1" || source.NOINDEX?.trim() === "true") return false;
  return site.startsWith("https://") && !isLocalSite(site);
}

/** SHEET_LAYOUT=normalized: the Sheet uses the 8-tab AI-directory layout (src/data/normalized/schema.ts). */
export function usesNormalizedLayout(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.SHEET_LAYOUT?.trim().toLowerCase() === "normalized";
}

/**
 * Rows with publish_status=preview (sample data) are shown only when SHOW_PREVIEW_RECORDS=1 AND the deployment
 * cannot be indexed (localhost or NOINDEX=1). On an indexable production site they are always hidden.
 */
export function previewRecordsAllowed(source: NodeJS.ProcessEnv = process.env): boolean {
  const wanted = source.SHOW_PREVIEW_RECORDS?.trim();
  return (wanted === "1" || wanted === "true") && !isIndexable(source);
}

