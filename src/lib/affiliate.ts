/**
 * Rules for the one affiliate URL each brand may have. /go/<brandId>/ only ever redirects to a URL that
 * passed `checkAffiliateUrl` when the Sheet was read; nothing from the request is used as a destination.
 */

/** Hosts of affiliate networks whose tracking links are allowed besides each brand's own domain. */
export const NETWORK_HOSTS: readonly string[] = [
  // Impact
  "sjv.io", "pxf.io", "7eer.net", "ojrq.net", "evyy.net", "8odi.net", "impact.com",
  // PartnerStack
  "partnerstack.com", "grsm.io",
  // CJ
  "anrdoezrs.net", "jdoqocy.com", "tkqlhce.com", "dpbolvw.net", "kqzyfj.com", "qksrv.net",
  // Awin, ShareASale, Rakuten, Partnerize
  "awin1.com", "shareasale.com", "linksynergy.com", "prf.hn",
  // Marketplaces and storefronts with their own affiliate links
  "lemonsqueezy.com", "gumroad.com", "appsumo.com", "digistore24.com", "hop.clickbank.net", "amzn.to",
];

export function extraHosts(source: NodeJS.ProcessEnv = process.env): string[] {
  return (source.AFFILIATE_EXTRA_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^\*\./, ""))
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));
}

/** host equals `suffix` or is a subdomain of it. */
export function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

const IP_V4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const RESERVED_TLDS = ["localhost", "local", "internal", "intranet", "lan", "home", "corp", "test", "invalid", "example"];

/** A hostname that can only be internal: IP literals, localhost, single labels, reserved suffixes. */
export function isInternalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (IP_V4.test(h) || h.startsWith("[") || h.includes(":")) return true;
  if (!h.includes(".")) return true;
  return RESERVED_TLDS.some((tld) => h === tld || h.endsWith(`.${tld}`));
}

/** Lowercase hostname for a brand domain cell ("www.jasper.ai", "https://jasper.ai/") or null. */
export function normalizeDomain(cell: string): string | null {
  const s = cell.trim().toLowerCase();
  if (!s) return null;
  let host: string;
  try {
    host = new URL(s.includes("://") ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || isInternalHost(host)) return null;
  return host;
}

export type AffiliateCheck = { ok: true; url: string; host: string } | { ok: false; reason: string };

/**
 * Validates an affiliate URL from the Sheet: https, no embedded credentials, default port, a public host,
 * and a host that is the brand's own domain, a known affiliate network or an AFFILIATE_EXTRA_HOSTS entry.
 */
export function checkAffiliateUrl(raw: string, brandDomain: string | null, extra: readonly string[] = extraHosts()): AffiliateCheck {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "affiliate_url is empty" };
  if (s.length > 2048) return { ok: false, reason: "affiliate_url is longer than 2048 characters" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "affiliate_url is not a valid URL" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "affiliate_url must use https" };
  if (u.username || u.password) return { ok: false, reason: "affiliate_url must not contain credentials" };
  if (u.port && u.port !== "443") return { ok: false, reason: "affiliate_url must use the default https port" };
  const host = u.hostname.toLowerCase();
  if (isInternalHost(host)) return { ok: false, reason: "affiliate_url points to an internal or reserved host" };
  const allowed = [...(brandDomain ? [brandDomain] : []), ...NETWORK_HOSTS, ...extra];
  if (!allowed.some((suffix) => hostMatches(host, suffix))) {
    return { ok: false, reason: `affiliate_url host ${host} is not the brand domain or an allowed affiliate network` };
  }
  return { ok: true, url: u.toString(), host };
}

/** https URL from a cell (logo, image, source) or null. Only used for display, never as a redirect target. */
export function httpsUrl(cell: string): URL | null {
  const s = cell.trim();
  if (!s || s.length > 2048) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || isInternalHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}
