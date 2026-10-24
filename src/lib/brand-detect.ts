import { hostMatches, isInternalHost, NETWORK_HOSTS, normalizeDomain } from "@/lib/affiliate";
import { slugify } from "@/lib/text";

/** Query parameters affiliate networks commonly use to carry the final destination. */
const DESTINATION_PARAMS = ["u", "url", "murl", "destination", "dest", "redirect", "redirect_url", "ued", "landing", "to"];

/** Second-level labels that are part of a public suffix (example.co.uk → example). */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);

export interface BrandSuggestion {
  /** Always "pending": a person confirms the suggestion before the brand is published. */
  status: "pending";
  affiliateHost: string;
  network: string | null;
  /** Registrable domain believed to be the brand, or null when only a network host is known. */
  domain: string | null;
  name: string | null;
  slug: string | null;
  /** How the domain was found, for the reviewer. */
  evidence: string[];
}

/** "app.jasper.ai" → "jasper.ai"; "shop.example.co.uk" → "example.co.uk". */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2]!;
  const take = SECOND_LEVEL.has(sld) && parts[parts.length - 1]!.length === 2 ? 3 : 2;
  return parts.slice(-take).join(".");
}

/** "copy-ai.com" → "Copy Ai". A starting point for a person to correct, not a verified brand name. */
export function nameFromDomain(domain: string): string {
  const label = domain.split(".")[0] ?? domain;
  return label
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function networkOf(host: string): string | null {
  return NETWORK_HOSTS.find((n) => hostMatches(host, n)) ?? null;
}

function destinationFrom(u: URL): string | null {
  for (const p of DESTINATION_PARAMS) {
    const v = u.searchParams.get(p);
    if (!v) continue;
    const domain = normalizeDomain(v.startsWith("http") ? v : `https://${v}`);
    if (domain && !networkOf(domain)) return domain;
  }
  return null;
}

/**
 * Suggests a brand for an affiliate URL from the URL alone and, when given, from the hosts of a redirect
 * chain followed with `followRedirects`. A network host is never taken as the brand. Nothing here is
 * trusted for publishing: the result is a suggestion with status "pending".
 */
export function suggestBrand(affiliateUrl: string, redirectHosts: readonly string[] = []): BrandSuggestion {
  const u = new URL(affiliateUrl);
  const host = u.hostname.toLowerCase();
  if (isInternalHost(host)) throw new Error("Affiliate URL points to an internal or reserved host");
  const network = networkOf(host);
  const evidence: string[] = [];
  let domain: string | null = null;

  if (!network) {
    domain = registrableDomain(host);
    evidence.push(`affiliate URL host ${host} is not a known network`);
  } else {
    const fromParam = destinationFrom(u);
    if (fromParam) {
      domain = registrableDomain(fromParam);
      evidence.push(`destination parameter on the ${network} link points to ${fromParam}`);
    }
  }
  if (!domain) {
    const final = [...redirectHosts].reverse().find((h) => !networkOf(h) && !isInternalHost(h));
    if (final) {
      domain = registrableDomain(final);
      evidence.push(`redirect chain ends on ${final}`);
    }
  }
  if (!domain) {
    evidence.push(network ? `only the network host ${host} is known; follow redirects or fill the brand by hand` : "no domain found");
  }
  const name = domain ? nameFromDomain(domain) : null;
  return { status: "pending", affiliateHost: host, network, domain, name, slug: name ? slugify(name) : null, evidence };
}
