const KEY = Symbol.for("ai-deals.rate-limit");
const g = globalThis as unknown as { [KEY]?: Map<string, { count: number; resetAt: number }> };
const MAX_KEYS = 10_000;

function buckets() {
  g[KEY] ??= new Map();
  return g[KEY];
}

/**
 * Fixed-window limiter in memory (per server process). It slows down scripts walking every URL or flooding
 * the contact form; for several instances or real attacks, add a CDN/WAF rule in front.
 */
export function allow(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const map = buckets();
  const b = map.get(key);
  if (!b || b.resetAt <= now) {
    if (map.size >= MAX_KEYS) {
      for (const [k, v] of map) if (v.resetAt <= now) map.delete(k);
      if (map.size >= MAX_KEYS) map.clear();
    }
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function resetRateLimits(): void {
  buckets().clear();
}

/** Best-effort client address behind a proxy. Trust it only when the proxy overwrites the header. */
export function clientKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/** Per client per window. */
export const LIMITS = {
  go: { limit: 120, windowMs: 60_000 },
  // A page can show a few dozen logos; each is one request.
  coupon: { limit: 60, windowMs: 60_000 },
  logo: { limit: 300, windowMs: 60_000 },
  search: { limit: 60, windowMs: 60_000 },
  contact: { limit: 5, windowMs: 600_000 },
  revalidate: { limit: 10, windowMs: 60_000 },
} as const;

export function withinLimit(headers: Headers, name: keyof typeof LIMITS): boolean {
  const { limit, windowMs } = LIMITS[name];
  return allow(`${name}:${clientKey(headers)}`, limit, windowMs);
}
