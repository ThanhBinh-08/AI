import { describe, expect, it } from "vitest";
import { logoOrSiteLogo, siteLogoPath } from "@/lib/logo-path";
import { candidates } from "@/lib/site-logo";

describe("logo fallback", () => {
  it("keeps the Sheet logo_url when there is one", () => {
    expect(logoOrSiteLogo("https://cdn.example.org/a.png", "T0001", "jasper.ai")).toBe("https://cdn.example.org/a.png");
  });

  it("uses the tool's own website logo when logo_url is empty", () => {
    expect(logoOrSiteLogo(null, "T0001", "jasper.ai")).toBe(siteLogoPath("T0001"));
    expect(siteLogoPath("T0001")).toBe("/logo/T0001/");
  });

  it("shows initials for placeholder or code-host sites and tools without a site", () => {
    expect(logoOrSiteLogo(null, "T0258", "www.quillnest.example.com")).toBeNull();
    expect(logoOrSiteLogo(null, "T0084", "github.com")).toBeNull();
    expect(logoOrSiteLogo(null, "T0001", null)).toBeNull();
  });

  it("prefers apple-touch-icon, then svg icon, then favicon.ico", () => {
    const html = `<link rel="icon" href="/f-32.png" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/f.svg"><link rel="apple-touch-icon" href="/apple.png">`;
    expect(candidates(html, "https://tool.ai/").map((c) => c.from)).toEqual(["apple-touch-icon", "icon-svg", "icon", "favicon.ico"]);
  });
});
