import type { CSSProperties } from "react";
import type { BlogKind } from "@/types/catalog";

/** Two glow colours per tone, all taken from the hero video's glow band (pink, violet, orange). */
export const TONES = [
  { a: "#f06bb4", b: "#f08a55" },
  { a: "#8f7bd8", b: "#f06bb4" },
  { a: "#f08a55", b: "#8f7bd8" },
  { a: "#8f7bd8", b: "#f08a55" },
] as const;

/** The same category always lights up in the same colours: on its cover, its chip and the top of its posts. */
const BY_CATEGORY: Record<string, number> = {
  "ai-writing": 0,
  "ai-image": 1,
  "ai-video": 2,
  "ai-coding": 1,
  "ai-audio": 0,
  productivity: 2,
  marketing: 0,
  business: 1,
  design: 2,
  automation: 1,
};

export function toneOf(post: { kind: BlogKind; categories: string[] }): number {
  if (post.kind === "guide") return 3;
  return BY_CATEGORY[post.categories[0] ?? ""] ?? 3;
}

export const toneOfCategory = (slug: string): number => BY_CATEGORY[slug] ?? 3;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * CSS variables of a cover: its two colours and where the glow sits, derived from the slug so every post has
 * its own cover and the same post always looks the same.
 */
export function coverVars(seed: string, tone: number): CSSProperties {
  const t = TONES[tone] ?? TONES[3];
  const h = hash(seed);
  return {
    "--tone-a": t.a,
    "--tone-b": t.b,
    "--gx": `${15 + (h % 70)}%`,
    "--gy": `${20 + ((h >>> 8) % 60)}%`,
  } as CSSProperties;
}
