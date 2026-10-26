import { isUnavailable, logoSiteOf } from "@/data/repository";
import { withinLimit } from "@/lib/rate-limit";
import { findSiteLogo } from "@/lib/site-logo";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
type Found = { buf: Buffer; type: string } | null;
/** One lookup per site per day (a miss is retried after an hour), shared by every visitor. */
const cache = new Map<string, { at: number; logo: Found; pending?: Promise<Found> }>();

const NOT_FOUND = { "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" };

async function logoFor(domain: string): Promise<Found> {
  const hit = cache.get(domain);
  if (hit?.pending) return hit.pending;
  if (hit && Date.now() - hit.at < (hit.logo ? DAY : DAY / 24)) return hit.logo;
  const pending = findSiteLogo(domain).then((f) => (f ? { buf: f.buf, type: f.type } : null));
  cache.set(domain, { at: Date.now(), logo: null, pending });
  const logo = await pending.catch(() => null);
  cache.set(domain, { at: Date.now(), logo });
  return logo;
}

/**
 * /logo/<tool_id>/ → the logo of that tool's own website (its icons, else /favicon.ico), for tools whose Sheet
 * logo_url is empty. The site comes only from the tool's Tools row; nothing in the request can point it elsewhere.
 * 404 when there is none: the page then shows the tool's initials.
 */
export async function GET(req: Request, { params }: { params: Promise<{ toolId: string }> }): Promise<Response> {
  if (!withinLimit(req.headers, "logo")) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  const { toolId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(toolId)) return new Response("Not found", { status: 404, headers: NOT_FOUND });
  try {
    const domain = await logoSiteOf(toolId);
    const logo = domain ? await logoFor(domain) : null;
    if (!logo) return new Response("Not found", { status: 404, headers: NOT_FOUND });
    return new Response(new Uint8Array(logo.buf), {
      headers: {
        "Content-Type": logo.type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Robots-Tag": "noindex",
        "X-Content-Type-Options": "nosniff",
        // An SVG from another site must never run anything when opened directly.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    if (isUnavailable(err)) return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "30" } });
    return new Response("Not found", { status: 404, headers: NOT_FOUND });
  }
}
