import { describe, expect, it } from "vitest";
import { followRedirects, guardedLookup, isBlockedAddress, type HeadRequest } from "@/lib/net-guard";

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local, metadata and reserved ranges", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) {
      expect(isBlockedAddress(a), a).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const a of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isBlockedAddress(a), a).toBe(false);
  });
});

describe("guardedLookup", () => {
  it("refuses a hostname that resolves to loopback", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup("localhost", {}, (e) => resolve(e)));
    expect(err?.code).toBe("EBLOCKED");
  });
});

function fake(map: Record<string, { status: number; location?: string }>): { request: HeadRequest; seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    request: async (url) => {
      seen.push(url.toString());
      const r = map[url.toString()] ?? { status: 200 };
      return { status: r.status, location: r.location ?? null };
    },
  };
}

describe("followRedirects", () => {
  it("follows a public chain", async () => {
    const f = fake({
      "https://brand.sjv.io/c/1": { status: 302, location: "https://www.brand.com/?ref=1" },
    });
    const hops = await followRedirects("https://brand.sjv.io/c/1", { request: f.request });
    expect(hops.map((h) => h.url)).toEqual(["https://brand.sjv.io/c/1", "https://www.brand.com/?ref=1"]);
  });

  it("stops at a redirect to an internal address or another protocol", async () => {
    const toMeta = fake({ "https://a.com/": { status: 302, location: "http://169.254.169.254/latest/meta-data/" } });
    await expect(followRedirects("https://a.com/", { request: toMeta.request })).rejects.toThrow(/internal/);
    expect(toMeta.seen).toEqual(["https://a.com/"]);

    const toFile = fake({ "https://a.com/": { status: 301, location: "file:///etc/passwd" } });
    await expect(followRedirects("https://a.com/", { request: toFile.request })).rejects.toThrow(/protocol/);

    const toPort = fake({ "https://a.com/": { status: 301, location: "http://a.com:6379/" } });
    await expect(followRedirects("https://a.com/", { request: toPort.request })).rejects.toThrow(/port/);

    const toLocal = fake({ "https://a.com/": { status: 301, location: "http://localhost/" } });
    await expect(followRedirects("https://a.com/", { request: toLocal.request })).rejects.toThrow(/localhost/);
  });

  it("gives up after the redirect limit", async () => {
    const loop = fake({ "https://a.com/": { status: 302, location: "https://a.com/" } });
    await expect(followRedirects("https://a.com/", { request: loop.request, maxRedirects: 3 })).rejects.toThrow(/More than 3 redirects/);
    expect(loop.seen).toHaveLength(4);
  });
});
