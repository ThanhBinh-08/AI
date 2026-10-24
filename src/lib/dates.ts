const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function valid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Reads a date cell as YYYY-MM-DD. Accepts ISO days, ISO timestamps and Google Sheets serial numbers
 * (days since 1899-12-30). Slash dates such as 10/11/2026 are ambiguous (US vs. day-first) and read as null:
 * dates are never guessed.
 */
export function parseDay(cell: string): string | null {
  const s = cell.trim();
  if (!s) return null;
  const m = ISO_DAY.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    const t = Date.UTC(1899, 11, 30) + serial * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

/** Today as YYYY-MM-DD in UTC. */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A coupon is expired once its last valid day (inclusive) has ended in UTC. */
export function isPast(day: string | null, now: Date = new Date()): boolean {
  return day !== null && day < today(now);
}

/** Whole days from today to a YYYY-MM-DD day (UTC); 0 = last day today. */
export function daysUntil(day: string, now: Date = new Date()): number {
  const [y, m, d] = day.split("-").map(Number);
  const [ty, tm, td] = today(now).split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(ty!, tm! - 1, td!)) / 86_400_000);
}

/** "Oct 22, 2026". */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
