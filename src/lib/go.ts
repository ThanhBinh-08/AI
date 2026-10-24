/**
 * Links to the affiliate redirect /go/<brandId>/. The optional context (which deal, which placement) only labels the
 * click for measurement; the redirect ignores it when choosing the destination, which always comes from the Sheet.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Where on the site an outbound CTA sits. Fixed list, so logs and reports stay comparable. */
export const PLACEMENTS = ["tool-offer", "deal-page", "deal-row", "deal-ticket", "brand", "compare", "article"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export interface GoContext {
  offer?: string | null;
  from?: Placement;
}

export function goHref(brandId: string, ctx: GoContext = {}): string {
  const q = new URLSearchParams();
  if (ctx.offer && ID.test(ctx.offer)) q.set("o", ctx.offer);
  if (ctx.from) q.set("p", ctx.from);
  const qs = q.toString();
  return `/go/${encodeURIComponent(brandId)}/${qs ? `?${qs}` : ""}`;
}

/** Reads the context back from a /go request URL; anything malformed is dropped, never echoed. */
export function readGoContext(url: string): { offer: string | null; from: Placement | null } {
  let sp: URLSearchParams;
  try {
    sp = new URL(url, "http://x").searchParams;
  } catch {
    return { offer: null, from: null };
  }
  const offer = sp.get("o");
  const from = sp.get("p");
  return {
    offer: offer && ID.test(offer) ? offer : null,
    from: from && (PLACEMENTS as readonly string[]).includes(from) ? (from as Placement) : null,
  };
}
