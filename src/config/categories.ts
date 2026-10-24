/**
 * Categories the Sheet may use (column `category`, by slug). A category page exists only while at least one
 * published brand, tool or deal belongs to it; empty categories are never rendered or listed.
 */
export interface CategoryDef {
  slug: string;
  name: string;
  /** One or two sentences shown at the top of the category page. */
  intro: string;
  /** Short glyph drawn in the dot-matrix display face. */
  glyph: string;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { slug: "ai-writing", name: "AI Writing", glyph: "Aa", intro: "Tools that draft, rewrite, summarize or check text: copy, articles, emails and documentation." },
  { slug: "ai-image", name: "AI Image Generation", glyph: "[]", intro: "Tools that create or edit images from text prompts or reference pictures." },
  { slug: "ai-video", name: "AI Video", glyph: ">", intro: "Tools that generate, edit, caption or dub video." },
  { slug: "ai-coding", name: "AI Coding", glyph: "</>", intro: "Assistants and agents that write, review, explain or test code." },
  { slug: "ai-audio", name: "AI Audio", glyph: "~", intro: "Voice generation, transcription, music and audio clean-up tools." },
  { slug: "productivity", name: "Productivity", glyph: "*", intro: "Note-taking, meeting, research and task tools that use AI to save time." },
  { slug: "marketing", name: "Marketing", glyph: "%", intro: "SEO, social media, advertising and email tools with AI features." },
  { slug: "business", name: "Business", glyph: "$", intro: "Sales, support, finance and operations software for teams." },
  { slug: "design", name: "Design", glyph: "#", intro: "Design, presentation and brand tools that use AI to speed up visual work." },
  { slug: "automation", name: "Automation", glyph: "@", intro: "Workflow, agent and integration tools that connect apps and run tasks for you." },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryBySlug(slug: string): CategoryDef | undefined {
  return BY_SLUG.get(slug);
}
