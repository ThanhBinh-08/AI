import { isUnavailable, resolveGo } from "@/data/repository";
import { readGoContext } from "@/lib/go";
import { withinLimit } from "@/lib/rate-limit";

// Every click must reach the affiliate network, so this is never cached; it is never indexed either.
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  // The brand learns the visit came from this site, not which page or search led to it.
  "Referrer-Policy": "origin",
};

/**
 * /go/<brandId>/ → 302 to that brand's one approved affiliate URL.
 * The destination comes only from the Sheet (validated: https, brand domain or allowed network); nothing in
 * the request — query string, headers or path beyond the id — can change it. Unknown, unpublished or
 * unapproved brands get a 404, never a fallback URL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ brandId: string }> }): Promise<Response> {
  if (!withinLimit(req.headers, "go")) {
    return new Response("Too many requests", { status: 429, headers: { ...HEADERS, "Retry-After": "60" } });
  }
  const { brandId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(brandId)) return new Response("Not found", { status: 404, headers: HEADERS });
  try {
    const target = await resolveGo(brandId);
    if (!target) return new Response("Not found", { status: 404, headers: HEADERS });
    // One line per outbound click for a server-side baseline (brand, deal, placement). No IP, user agent or
    // cookie is read or stored, and the context never influences the destination above.
    if (req.method === "GET") {
      const ctx = readGoContext(req.url);
      console.info(`[go] click brand=${brandId} offer=${ctx.offer ?? "-"} from=${ctx.from ?? "-"}`);
    }
    return new Response(null, { status: 302, headers: { ...HEADERS, Location: target } });
  } catch (err) {
    if (isUnavailable(err)) return new Response("Temporarily unavailable", { status: 503, headers: { ...HEADERS, "Retry-After": "30" } });
    console.error(`[go] unexpected error for ${brandId}`);
    return new Response("Something went wrong", { status: 500, headers: HEADERS });
  }
}

export const HEAD = GET;
