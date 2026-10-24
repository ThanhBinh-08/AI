import type { Issue } from "@/types/catalog";

export const TAB_NAMES = ["Brands", "Coupons", "Products", "Content"] as const;

export type TabName = (typeof TAB_NAMES)[number];

/** Other titles a tab may carry. Matching ignores case, spaces, "-" and "_". */
export const TAB_TITLE_ALIASES: Record<TabName, readonly string[]> = {
  Brands: ["Stores"],
  Coupons: ["Deals"],
  Products: ["Tools"],
  Content: ["Posts", "Blog"],
};

/** Raw cell values per tab; row 0 is the header. */
export type RawTabs = Record<TabName, string[][]>;

export interface SheetSource {
  /** "sheets", "fixture" or "none" — reported on /api/health. */
  readonly kind: "sheets" | "fixture" | "none";
  fetchTabs(): Promise<RawTabs>;
  /** Problems found while adapting another layout to RawTabs; merged into the catalog issues. */
  readonly adapterIssues?: readonly Issue[];
}

export function emptyTabs(): RawTabs {
  return { Brands: [], Coupons: [], Products: [], Content: [] };
}

const norm = (title: string) => title.toLowerCase().replace(/[\s_-]+/g, "");

export function tabForTitle(title: string): TabName | undefined {
  return TAB_NAMES.find((t) => [t, ...TAB_TITLE_ALIASES[t]].some((n) => norm(n) === norm(title)));
}

/** No data source configured: the site renders its empty states. */
export class EmptySource implements SheetSource {
  readonly kind = "none" as const;
  async fetchTabs(): Promise<RawTabs> {
    return emptyTabs();
  }
}
