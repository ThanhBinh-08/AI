import { timingSafeEqual } from "node:crypto";
import { getHome, storeHealth } from "@/data/repository";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/**
 * Health check for uptime monitors: 200 when a catalog can be served, 503 otherwise.
 * The list of Sheet issues (row numbers and reasons) is only returned with the revalidate secret.
 */
export async function GET(req: Request): Promise<Response> {
  let ok = true;
  try {
    await getHome();
  } catch {
    ok = false;
  }
  const h = storeHealth();
  const expected = process.env.REVALIDATE_SECRET?.trim() ?? "";
  const given = Buffer.from(req.headers.get("x-revalidate-secret") ?? "");
  const admin = expected.length >= 32 && given.length === Buffer.byteLength(expected) && timingSafeEqual(given, Buffer.from(expected));
  return Response.json(
    {
      ok,
      source: h.source,
      loadedAt: h.loadedAt,
      lastError: h.lastError,
      issueCount: h.issues.length,
      ...(admin ? { issues: h.issues } : {}),
    },
    { status: ok ? 200 : 503, headers: PRIVATE },
  );
}
