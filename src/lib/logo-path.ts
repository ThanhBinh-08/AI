/** Hosts whose icon is not the tool's brand: a repo page shows the code host's logo, example.* is a placeholder. */
export const NOT_A_BRAND_HOST = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|example\.(com|org|net))$/i;

/** Where the website logo of a tool is served when its Sheet logo_url is empty (see app/logo/[toolId]/route.ts). */
export const siteLogoPath = (toolId: string) => `/logo/${encodeURIComponent(toolId)}/`;

/** The logo to show: the Sheet's logo_url, else the logo of the tool's own website, else none (monogram). */
export function logoOrSiteLogo(logo: string | null, toolId: string, domain: string | null): string | null {
  if (logo) return logo;
  return domain && !NOT_A_BRAND_HOST.test(domain) ? siteLogoPath(toolId) : null;
}
