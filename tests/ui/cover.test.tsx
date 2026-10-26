import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Cover } from "@/components/blog/blog";
import { SITE_LOGO } from "@/config/site";
import type { PostView } from "@/types/catalog";

const post = (over: Partial<PostView> = {}): PostView => ({
  id: "P1", type: "blog", slug: "check-a-code", title: "How to check a code", excerpt: "", body: "", seoTitle: null, seoDescription: null,
  publishedAt: "2026-10-22", updatedAt: null, author: null, brandId: null, productId: null, productIds: [], status: "published",
  kind: "guide", readingMinutes: 2, tool: null, categories: [], directoryProfile: false, indexable: true, ...over,
});

const markSrc = (p: PostView) => render(<Cover post={p} />).container.querySelector(".cover-mark img")?.getAttribute("src");

describe("blog cover mark", () => {
  it("shows the tool's logo when the post is about a tool with one", () => {
    const tool = { id: "T1", name: "Alpha", slug: "alpha", logoUrl: "https://cdn.alpha-tool.io/logo.png", categories: [], verified: false, listingSource: null };
    expect(markSrc(post({ kind: "review", tool }))).toBe("https://cdn.alpha-tool.io/logo.png");
  });

  it("shows the site's own logo, never 'Aa' or initials, when there is no tool logo", () => {
    expect(markSrc(post())).toBe(SITE_LOGO);
    expect(markSrc(post({ kind: "comparison" }))).toBe(SITE_LOGO);
    const tool = { id: "T2", name: "Beta", slug: "beta", logoUrl: null, categories: [], verified: false, listingSource: null };
    expect(markSrc(post({ kind: "review", tool }))).toBe(SITE_LOGO);
  });
});
