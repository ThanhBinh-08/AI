import { z } from "zod";
import { httpsUrl } from "@/lib/affiliate";

export const TOPICS = ["deal-not-working", "wrong-information", "other"] as const;

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Use at most 100 characters."),
  email: z.string().trim().max(200, "Use at most 200 characters.").pipe(z.email("Enter a valid email address.")),
  topic: z.enum(TOPICS, { error: "Choose a topic." }),
  message: z.string().trim().min(10, "Write at least 10 characters.").max(5000, "Use at most 5,000 characters."),
  /** Honeypot: hidden from people, filled in by many bots. */
  website: z.string().max(200).optional().default(""),
  /** When the form was rendered (ms since epoch). */
  startedAt: z.number().int().positive(),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const MAX_CONTACT_BYTES = 12_000;
/** Faster than this from page load to submit is a script, not a person. */
export const MIN_FILL_MS = 3000;

export function contactWebhook(env: NodeJS.ProcessEnv = process.env): URL | null {
  const raw = env.CONTACT_WEBHOOK_URL?.trim();
  return raw ? httpsUrl(raw) : null;
}

export function contactEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  const e = env.CONTACT_EMAIL?.trim() ?? "";
  return z.email().safeParse(e).success ? e : null;
}
