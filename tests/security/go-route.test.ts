import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/go/[brandId]/route";
import { FixtureSource } from "@/data/sheets/fixture-source";
import { resetStore } from "@/data/store";
import { resetRateLimits } from "@/lib/rate-limit";

const call = (brandId: string, query = "", ip = "203.0.113.9") =>
  GET(new Request(`http://localhost:3400/go/${brandId}/${query}`, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ brandId }),
  });

beforeEach(() => {
  resetStore(new FixtureSource());
  resetRateLimits();
});

describe("/go/[brandId]", () => {
  it("302s to the brand's approved affiliate URL, uncached and noindex", async () => {
    const res = await call("quill");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://quillwise.sjv.io/c/1/2/3");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("ignores any destination passed in the query string (no open redirect)", async () => {
    for (const q of ["?url=https://evil.example.com", "?to=//evil.com", "?redirect=javascript:alert(1)", "?u=http://169.254.169.254/"]) {
      const res = await call("quill", q);
      expect(res.headers.get("location")).toBe("https://quillwise.sjv.io/c/1/2/3");
    }
  });

  it("404s unknown, unapproved, draft, http and disallowed-host brands", async () => {
    for (const id of ["ghost", "codely", "draftco", "insecure", "offlist"]) {
      const res = await call(id);
      expect(res.status, id).toBe(404);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("rejects malformed ids without touching the data", async () => {
    for (const id of ["../etc/passwd", "a".repeat(65), "https:%2F%2Fevil.com", "<script>"]) {
      expect((await call(id)).status).toBe(404);
    }
  });

  it("rate limits one client that walks many ids", async () => {
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await call("quill", "", "198.51.100.7")).status;
    expect(last).toBe(429);
    expect((await call("quill", "", "198.51.100.8")).status).toBe(302);
  });
});
