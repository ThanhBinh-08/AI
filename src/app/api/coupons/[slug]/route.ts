import { getDealReveal, isUnavailable } from "@/data/repository";
import { withinLimit } from "@/lib/rate-limit";

// The code is fetched when the popup opens, never rendered into a list; so this is never cached or indexed.
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/** GET /api/coupons/<slug> → the popup data of one live, checked deal. Unknown, expired or unchecked deals are 404. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  if (!withinLimit(req.headers, "coupon")) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...HEADERS, "Retry-After": "60" } });
  }
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(slug)) return Response.json({ error: "Not found" }, { status: 404, headers: HEADERS });
  try {
    const deal = await getDealReveal(slug);
    if (!deal) return Response.json({ error: "Not found" }, { status: 404, headers: HEADERS });
    return Response.json(deal, { headers: HEADERS });
  } catch (err) {
    if (isUnavailable(err)) return Response.json({ error: "Temporarily unavailable" }, { status: 503, headers: { ...HEADERS, "Retry-After": "30" } });
    return Response.json({ error: "Something went wrong" }, { status: 500, headers: HEADERS });
  }
}
