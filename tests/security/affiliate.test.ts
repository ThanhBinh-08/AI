import { describe, expect, it } from "vitest";
import { checkAffiliateUrl, httpsUrl, isInternalHost, normalizeDomain } from "@/lib/affiliate";
import { nameFromDomain, registrableDomain, suggestBrand } from "@/lib/brand-detect";

describe("checkAffiliateUrl", () => {
  it("accepts https links on the brand domain or a known network", () => {
    expect(checkAffiliateUrl("https://jasper.ai/?fpr=abc", "jasper.ai", [])).toMatchObject({ ok: true });
    expect(checkAffiliateUrl("https://try.jasper.ai/x", "jasper.ai", [])).toMatchObject({ ok: true });
    expect(checkAffiliateUrl("https://brand.sjv.io/c/1/2/3", null, [])).toMatchObject({ ok: true });
  });

  it("accepts extra hosts from configuration", () => {
    expect(checkAffiliateUrl("https://go.partner.io/x", null, ["partner.io"])).toMatchObject({ ok: true });
  });

  it("rejects http, credentials, odd ports, internal hosts and unknown hosts", () => {
    const bad = [
      "http://brand.sjv.io/x",
      "https://user:pass@brand.sjv.io/x",
      "https://brand.sjv.io:8443/x",
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://[::1]/x",
      "https://metadata.internal/x",
      "https://evil.com/?u=https://jasper.ai",
      "https://jasper.ai.evil.com/x",
      "javascript:alert(1)",
      "not a url",
      "",
    ];
    for (const url of bad) expect(checkAffiliateUrl(url, "jasper.ai", []).ok, url).toBe(false);
  });
});

describe("host helpers", () => {
  it("spots internal hosts", () => {
    for (const h of ["localhost", "10.0.0.1", "intranet", "printer.local", "x.internal", "[::1]"]) expect(isInternalHost(h), h).toBe(true);
    expect(isInternalHost("jasper.ai")).toBe(false);
  });

  it("normalises brand domains", () => {
    expect(normalizeDomain("https://www.Jasper.ai/pricing")).toBe("jasper.ai");
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("only accepts public https URLs for display fields", () => {
    expect(httpsUrl("https://cdn.example.org/logo.png")?.hostname).toBe("cdn.example.org");
    expect(httpsUrl("http://cdn.example.org/logo.png")).toBeNull();
    expect(httpsUrl("data:image/png;base64,AAA")).toBeNull();
  });
});

describe("brand detection", () => {
  it("takes a non-network host as the brand", () => {
    const s = suggestBrand("https://app.copy-tool.com/?via=x");
    expect(s).toMatchObject({ status: "pending", network: null, domain: "copy-tool.com", name: "Copy Tool", slug: "copy-tool" });
  });

  it("never takes a network host as the brand", () => {
    const s = suggestBrand("https://brand.sjv.io/c/1/2/3");
    expect(s.network).toBe("sjv.io");
    expect(s.domain).toBeNull();
  });

  it("reads the destination from network link parameters", () => {
    const s = suggestBrand("https://www.awin1.com/cread.php?awinmid=1&ued=https%3A%2F%2Fwww.example-shop.co.uk%2F");
    expect(s.domain).toBe("example-shop.co.uk");
  });

  it("uses the end of a redirect chain when given", () => {
    const s = suggestBrand("https://brand.sjv.io/c/1", ["brand.sjv.io", "www.realbrand.io"]);
    expect(s.domain).toBe("realbrand.io");
  });

  it("refuses internal hosts", () => {
    expect(() => suggestBrand("https://192.168.0.1/x")).toThrow();
  });

  it("helpers", () => {
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
    expect(nameFromDomain("my-tool.ai")).toBe("My Tool");
  });
});
