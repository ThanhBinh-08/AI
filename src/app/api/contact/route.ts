import { contactSchema, contactWebhook, MAX_CONTACT_BYTES, MIN_FILL_MS } from "@/lib/contact";
import { getSiteUrl, isLocalSite } from "@/lib/env";
import { withinLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...PRIVATE, ...extra } });
}

/** Same-origin posts only: a page on another site cannot submit the form in a visitor's name. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const site = new URL(getSiteUrl()).origin;
  if (origin === site) return true;
  // Local runs use whatever port the dev server picked.
  return isLocalSite() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export async function POST(req: Request): Promise<Response> {
  const webhook = contactWebhook();
  if (!webhook) return json({ error: "The contact form is not available right now." }, 503);
  if (!sameOrigin(req)) return json({ error: "Request refused." }, 403);
  if (!withinLimit(req.headers, "contact")) {
    return json({ error: "Too many messages. Try again in a few minutes." }, 429, { "Retry-After": "600" });
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send the form as JSON." }, 415);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_CONTACT_BYTES) return json({ error: "The message is too long." }, 413);

  const text = await req.text();
  if (text.length > MAX_CONTACT_BYTES) return json({ error: "The message is too long." }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: "The form data could not be read." }, 400);
  }
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= issue.message;
    }
    return json({ error: "Check the highlighted fields.", fields }, 422);
  }
  const data = parsed.data;
  const elapsed = Date.now() - data.startedAt;
  // Bots: answer like a success so they do not adapt, but deliver nothing.
  if (data.website || elapsed < MIN_FILL_MS || elapsed > 86_400_000) return json({ ok: true });

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: data.name, email: data.email, topic: data.topic, message: data.message, receivedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`webhook answered ${res.status}`);
  } catch (err) {
    // The log gets the reason, never the message content or the visitor's details.
    console.error(`[contact] delivery failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`);
    return json({ error: "Your message could not be sent. Please try again later." }, 502);
  }
  return json({ ok: true });
}
