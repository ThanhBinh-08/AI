/** Site-wide settings. Values that differ per deployment come from env (see .env.example). */
export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "AI Tools & Deals",
  tagline: "Find AI tools and software deals, see where every code comes from, and compare before you pay.",
  locale: "en_US",
  /** Shown in the hero and the footer. */
  description:
    "An independent directory of AI tools and software discount codes. Each deal shows its source, its check status and its expiry date.",
} as const;

/**
 * The byline and the "About the author" panel. By default the site itself is the author: no invented person.
 * To publish under your own name, set NEXT_PUBLIC_AUTHOR_NAME / NEXT_PUBLIC_AUTHOR_ROLE / NEXT_PUBLIC_AUTHOR_BIO.
 */
export const AUTHOR = {
  name: process.env.NEXT_PUBLIC_AUTHOR_NAME?.trim() || SITE.name,
  role: process.env.NEXT_PUBLIC_AUTHOR_ROLE?.trim() || "Independent AI tool directory",
  bio:
    process.env.NEXT_PUBLIC_AUTHOR_BIO?.trim() ||
    "We list AI tools and software deals, show where every figure comes from and when it was checked, and say plainly when we have not tested something ourselves.",
} as const;

/** Header navigation. Search is rendered separately as the round button. */
export const NAV = [
  { href: "/", label: "Home" },
  { href: "/deals/", label: "Deals" },
  { href: "/tools/", label: "AI Tools" },
  { href: "/categories/", label: "Categories" },
  { href: "/compare/", label: "Compare" },
  { href: "/blog/", label: "Blog" },
] as const;

export const PAGE_SIZE = 24;
