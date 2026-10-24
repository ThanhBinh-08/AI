/** Short, log-safe code for what went wrong while reading the Sheet. */
export type SheetsErrorCode = "quota" | "timeout" | "network" | "auth" | "http" | "invalid";

/**
 * Next signals "this render needs request-time data" by throwing an error with this digest (for example a
 * no-store fetch during prerender). It must reach Next untouched, so the route becomes dynamic instead of failing.
 */
export function isNextDynamicUsage(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE";
}

const BRAND = Symbol.for("ai-deals.sheets-error");

/** A failed Google request. Next bundles modules more than once, so errors are recognised by a brand, not instanceof. */
export class SheetsRequestError extends Error {
  readonly [BRAND] = "request";
  constructor(
    readonly code: SheetsErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SheetsRequestError";
  }
}

/** No catalog can be served at all (first read failed and nothing is cached). Pages fall back to error.tsx. */
export class CatalogUnavailableError extends Error {
  readonly [BRAND] = "unavailable";
  constructor(
    readonly code: SheetsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CatalogUnavailableError";
  }
}

export function isUnavailable(err: unknown): err is CatalogUnavailableError {
  return typeof err === "object" && err !== null && (err as { [BRAND]?: string })[BRAND] === "unavailable";
}

export function errorCode(err: unknown): SheetsErrorCode {
  if (typeof err === "object" && err !== null && "code" in err) {
    const c = (err as { code: unknown }).code;
    if (typeof c === "string" && ["quota", "timeout", "network", "auth", "http", "invalid"].includes(c)) return c as SheetsErrorCode;
  }
  return "invalid";
}

/** One line, no control characters, bounded: safe for logs and /api/health. */
export function shortMessage(err: unknown, max = 200): string {
  const text = err instanceof Error ? err.message : "unknown error";
  return text.replace(/[\r\n\t]+/g, " ").slice(0, max);
}
