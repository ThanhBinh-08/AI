/**
 * Conversion measurement, off unless configured. With NEXT_PUBLIC_ANALYTICS_PROVIDER=plausible and
 * NEXT_PUBLIC_ANALYTICS_DOMAIN set, three events are sent to Plausible (cookieless, no personal data):
 *   coupon_impression  a checked coupon card was at least half visible (once per coupon per page view)
 *   copy_code          the Copy button of a coupon was pressed
 *   affiliate_click    an outbound CTA to /go/<brand>/ was pressed
 * Each carries only: brand id, deal id, placement on the page and page type. Page views (tool pages included) and
 * device type come from Plausible itself. A click is not a sale: sales are only known from the affiliate network.
 *
 * Nothing is sent when the browser asks not to be tracked (Do Not Track / Global Privacy Control), after an
 * opt-out, or — when NEXT_PUBLIC_ANALYTICS_CONSENT=required — before the visitor agrees.
 */

export type EventName = "coupon_impression" | "copy_code" | "affiliate_click";

export interface EventProps {
  page_type: string;
  brand?: string;
  offer?: string;
  placement?: string;
}

export const OPT_OUT_KEY = "analytics-opt-out";
export const CONSENT_KEY = "analytics-consent";

export interface AnalyticsConfig {
  provider: "plausible" | null;
  domain: string | null;
  consentRequired: boolean;
}

export function readConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_ANALYTICS_PROVIDER: process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER,
  NEXT_PUBLIC_ANALYTICS_DOMAIN: process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN,
  NEXT_PUBLIC_ANALYTICS_CONSENT: process.env.NEXT_PUBLIC_ANALYTICS_CONSENT,
}): AnalyticsConfig {
  const provider = env.NEXT_PUBLIC_ANALYTICS_PROVIDER?.trim().toLowerCase() === "plausible" ? "plausible" : null;
  const domain = env.NEXT_PUBLIC_ANALYTICS_DOMAIN?.trim() || null;
  return { provider: provider && domain ? provider : null, domain, consentRequired: env.NEXT_PUBLIC_ANALYTICS_CONSENT?.trim() === "required" };
}

export interface PrivacySignals {
  doNotTrack: boolean;
  optedOut: boolean;
  consent: "granted" | "denied" | null;
}

/** Whether events may be sent at all. */
export function trackingAllowed(cfg: AnalyticsConfig, p: PrivacySignals): boolean {
  if (!cfg.provider) return false;
  if (p.doNotTrack || p.optedOut || p.consent === "denied") return false;
  return cfg.consentRequired ? p.consent === "granted" : true;
}

/** Page type from the path, for click-through by page type. */
export function pageTypeOf(path: string): string {
  const seg = path.split("/").filter(Boolean);
  if (seg.length === 0) return "home";
  const [first, second] = seg;
  const detail: Record<string, string> = { deals: "deal", tools: "tool", brands: "brand", categories: "category", compare: "compare", alternatives: "alternatives", blog: "blog" };
  if (first && first in detail) return second ? detail[first]! : `${first}-list`;
  return first === "search" ? "search" : "other";
}

/**
 * Sends events through `send`, dropping duplicates: an impression once per coupon per page view, a click or copy
 * not twice within `windowMs` (double clicks, repeated taps).
 */
export function createTracker(send: (name: EventName, props: EventProps) => void, opts: { windowMs?: number; now?: () => number } = {}) {
  const windowMs = opts.windowMs ?? 1000;
  const now = opts.now ?? (() => Date.now());
  const impressions = new Set<string>();
  const lastAction = new Map<string, number>();
  return {
    track(name: EventName, props: EventProps): boolean {
      const key = `${name}|${props.page_type}|${props.brand ?? ""}|${props.offer ?? ""}|${props.placement ?? ""}`;
      if (name === "coupon_impression") {
        if (impressions.has(key)) return false;
        impressions.add(key);
      } else {
        const t = now();
        const last = lastAction.get(key);
        if (last !== undefined && t - last < windowMs) return false;
        lastAction.set(key, t);
      }
      const clean: EventProps = { page_type: props.page_type };
      if (props.brand) clean.brand = props.brand;
      if (props.offer) clean.offer = props.offer;
      if (props.placement) clean.placement = props.placement;
      send(name, clean);
      return true;
    },
    /** New page view: impressions may be counted again. */
    newPage() {
      impressions.clear();
    },
  };
}
