import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { forceRefresh } from "@/data/repository";
import { withinLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Admin action: re-read the Sheet now and rebuild every cached page, instead of waiting up to 5 minutes.
 * Requires the x-revalidate-secret header to equal REVALIDATE_SECRET (32+ characters). Read-only towards the Sheet.
 */
export async function POST(req: Request): Promise<Response> {
  if (!withinLimit(req.headers, "revalidate")) return Response.json({ error: "Too many requests" }, { status: 429, headers: PRIVATE });
  const expected = process.env.REVALIDATE_SECRET?.trim() ?? "";
  if (expected.length < 32) return Response.json({ error: "Not configured" }, { status: 503, headers: PRIVATE });
  if (!secretMatches(req.headers.get("x-revalidate-secret"), expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE });
  }
  try {
    await forceRefresh();
  } catch {
    return Response.json({ error: "The Sheet could not be read; cached pages were kept" }, { status: 502, headers: PRIVATE });
  }
  revalidatePath("/", "layout");
  return Response.json({ ok: true, refreshedAt: new Date().toISOString() }, { headers: PRIVATE });
}
