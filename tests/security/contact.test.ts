import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/contact/route";
import { resetRateLimits } from "@/lib/rate-limit";

const ORIGIN = "https://deals.example.org";

function req(body: unknown, opts: { origin?: string | null; ip?: string; type?: string } = {}) {
  const headers: Record<string, string> = { "content-type": opts.type ?? "application/json", "x-forwarded-for": opts.ip ?? "203.0.113.1" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  return new Request("https://deals.example.org/api/contact/", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

const valid = () => ({ name: "Ana", email: "ana@example.org", topic: "deal-not-working", message: "The code SAMPLE20 failed today.", website: "", startedAt: Date.now() - 10_000 });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetRateLimits();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hooks.example.org/contact");
  fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/contact", () => {
  it("delivers a valid message to the webhook and only then reports success", async () => {
    const res = await POST(req(valid()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://hooks.example.org/contact");
    expect(JSON.parse(init.body)).toMatchObject({ name: "Ana", topic: "deal-not-working" });
  });

  it("reports failure when the webhook fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    const res = await POST(req(valid()));
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBeUndefined();
  });

  it("is unavailable without a configured webhook", async () => {
    vi.stubEnv("CONTACT_WEBHOOK_URL", "");
    expect((await POST(req(valid()))).status).toBe(503);
  });

  it("refuses other origins and missing origins", async () => {
    expect((await POST(req(valid(), { origin: "https://evil.example.com" }))).status).toBe(403);
    expect((await POST(req(valid(), { origin: null }))).status).toBe(403);
  });

  it("validates fields and returns per-field messages", async () => {
    const res = await POST(req({ ...valid(), email: "nope", message: "short" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Object.keys(body.fields).sort()).toEqual(["email", "message"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-JSON, broken JSON and oversized bodies", async () => {
    expect((await POST(req("a=b", { type: "application/x-www-form-urlencoded" }))).status).toBe(415);
    expect((await POST(req("{not json"))).status).toBe(400);
    expect((await POST(req({ ...valid(), message: "x".repeat(20_000) }))).status).toBe(413);
  });

  it("drops honeypot and too-fast submissions silently", async () => {
    expect((await POST(req({ ...valid(), website: "http://spam" }))).status).toBe(200);
    expect((await POST(req({ ...valid(), startedAt: Date.now() }))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate limits repeated messages from one client", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await POST(req(valid(), { ip: "198.51.100.3" }))).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
