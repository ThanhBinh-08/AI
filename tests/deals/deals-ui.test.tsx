import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/deals/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { CouponCard } from "@/components/deals/CouponCard";
import { countLine, DealsMarket } from "@/components/deals/DealsMarket";
import { CopyCode } from "@/components/ui/CopyCode";
import { OutboundLink } from "@/components/ui/bits";
import { parseMarketState, type Market, type MarketCoupon } from "@/lib/market";
import { CATEGORIES } from "@/config/categories";

const coupon = (over: Partial<MarketCoupon> = {}): MarketCoupon => ({
  slug: "alpha-a1",
  brandSlug: "alpha",
  brandName: "Alpha",
  brandLogo: null,
  categories: ["ai-writing"],
  title: "20% off Alpha annual",
  discount: "20% off",
  code: "ALPHA-20%x",
  terms: "Annual plans only.",
  expiresAt: "2099-12-31",
  verification: "source_verified",
  verifiedAt: "2026-10-20",
  goHref: "/go/T1/?o=A1&p=deals-market",
  ...over,
});

function market(over: Partial<Market> = {}): Market {
  const coupons = over.coupons ?? [];
  return {
    coupons,
    categories: CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, coupons: coupons.filter((k) => k.categories.includes(c.slug)).length })).filter((c) => c.coupons > 0),
    ...over,
  };
}

/** 30 coupons of 30 brands, alternating writing / video. */
const many = () =>
  Array.from({ length: 30 }, (_, i) => {
    const n = String(i).padStart(2, "0");
    return coupon({ slug: `brand${n}-d`, brandSlug: `brand${n}`, brandName: `Brand${n}`, code: `CODE${n}`, title: `Deal ${n}`, categories: i % 2 ? ["ai-video"] : ["ai-writing"] });
  });

const initial = (m: Market, q = "") => {
  const sp = new URLSearchParams(q);
  return parseMarketState((k) => sp.get(k) ?? "", m);
};

beforeEach(() => {
  pathname = "/deals/";
  window.history.replaceState(null, "", "/deals/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Copy Code", () => {
  it("copies the exact stored code and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<CopyCode code=" ALPHA-20%x" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy code/ }));
    });
    expect(writeText).toHaveBeenCalledWith(" ALPHA-20%x");
    expect(screen.getByRole("status")).toHaveTextContent("copied");
  });

  it("tells the visitor to select the code when the clipboard is blocked", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<CopyCode code="X1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy code X1" }));
    });
    expect(screen.getByRole("button")).toHaveTextContent("Select it");
  });

  it("renders nothing on Blog routes", () => {
    pathname = "/blog/some-post/";
    const { container } = render(<CopyCode code="SECRET" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Coupon card", () => {
  it("shows brand, discount, exact code, terms, check and end date, and links Get Deal through /go/", () => {
    render(<ul><CouponCard coupon={coupon()} /></ul>);
    expect(screen.getByText("ALPHA-20%x")).toBeInTheDocument();
    expect(screen.getByText("Annual plans only.")).toBeInTheDocument();
    expect(screen.getByText(/Source checked/)).toBeInTheDocument();
    expect(screen.getByText(/Ends Dec 31, 2099/)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Get Deal/ });
    expect(cta).toHaveAttribute("href", "/go/T1/?o=A1&p=deals-market");
    expect(cta).toHaveAttribute("rel", "sponsored nofollow noopener");
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/brands/alpha/");
  });

  it("explains a missing affiliate link instead of linking anywhere else", () => {
    render(<ul><CouponCard coupon={coupon({ goHref: null, code: null })} /></ul>);
    expect(screen.queryByRole("link", { name: /Get Deal/ })).toBeNull();
    expect(screen.getByText("No partner link yet")).toBeInTheDocument();
    expect(screen.queryByText(/No code/)).toBeNull();
    expect(document.querySelector(".code-copy")).toBeNull();
  });

  it("refuses any destination that is not the /go/ redirect", () => {
    render(<OutboundLink href="https://evil.example/">Go</OutboundLink>);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("Deals list", () => {
  it("shows a truthful empty state with next steps when no deal is eligible", () => {
    const m = market();
    render(<DealsMarket market={m} initial={initial(m)} />);
    expect(screen.getByRole("heading", { name: "All deals" })).toBeInTheDocument();
    expect(screen.getByText("No verified deals right now")).toBeInTheDocument();
    expect(document.querySelectorAll(".deal-row")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Browse AI tools" })).toHaveAttribute("href", "/tools/");
    expect(screen.getByRole("link", { name: "See all brands" })).toHaveAttribute("href", "/brands/");
    // No brand grid, no category blocks, no search over nothing.
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("pages through the list 24 at a time", () => {
    const m = market({ coupons: many() });
    render(<DealsMarket market={m} initial={initial(m)} />);
    expect(document.querySelector(".mk-count")).toHaveTextContent("Showing 24 of 30 deals");
    expect(document.querySelectorAll(".deal-row")).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "Show 6 more" }));
    expect(document.querySelectorAll(".deal-row")).toHaveLength(30);
  });

  it("filters by the category pill, mirrors it in the URL and resets", () => {
    const m = market({ coupons: many() });
    render(<DealsMarket market={m} initial={initial(m)} />);
    const pill = screen.getByLabelText("Category");
    fireEvent.change(pill, { target: { value: "ai-video" } });
    expect(pill).toHaveAttribute("data-active", "true");
    expect(document.querySelectorAll(".deal-row")).toHaveLength(15);
    expect(window.location.search).toBe("?category=ai-video");
    fireEvent.change(pill, { target: { value: "" } });
    expect(pill).not.toHaveAttribute("data-active");
    expect(document.querySelectorAll(".deal-row")).toHaveLength(24);
    expect(window.location.search).toBe("");
  });

  it("puts the category pill before Sort by and lists only categories that have deals", () => {
    const m = market({ coupons: many() });
    render(<DealsMarket market={m} initial={initial(m)} />);
    const options = within(screen.getByLabelText("Category")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All Categories (30)", "AI Writing (15)", "AI Video (15)"]);
    const selects = [...document.querySelectorAll(".mk-filters select")].map((el) => el.getAttribute("name"));
    expect(selects.indexOf("category")).toBeLessThan(selects.indexOf("sort"));
    // Categories replace the old brand filter: there is no "All brands" control any more.
    expect(screen.queryByText("All brands")).toBeNull();
    expect(screen.queryByLabelText("Brand")).toBeNull();
  });

  it("searches with the round search key", () => {
    const m = market({ coupons: many() });
    render(<DealsMarket market={m} initial={initial(m)} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "code03" } });
    fireEvent.click(screen.getByRole("button", { name: "Search deals" }));
    expect(document.querySelectorAll(".deal-row")).toHaveLength(1);
  });

  it("debounces search and shows a no-results message with a reset", () => {
    vi.useFakeTimers();
    const m = market({ coupons: many() });
    render(<DealsMarket market={m} initial={initial(m)} />);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "code03" } });
    expect(document.querySelectorAll(".deal-row")).toHaveLength(24); // not yet
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(document.querySelectorAll(".deal-row")).toHaveLength(1);
    expect(window.location.search).toBe("?q=code03");
    fireEvent.change(box, { target: { value: "zzzz" } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText("No deals match")).toBeInTheDocument();
    fireEvent.click(within(document.querySelector(".mk-empty") as HTMLElement).getByRole("button", { name: "Reset filters" }));
    expect(box).toHaveValue("");
    expect(document.querySelectorAll(".deal-row")).toHaveLength(24);
  });

  it("keeps a brand filter that arrives in the link, shown as a pill that clears it", () => {
    const m = market({ coupons: [coupon(), coupon({ slug: "beta-b1", brandSlug: "brand01", brandName: "Brand01", code: "B10", categories: ["ai-video"] })] });
    render(<DealsMarket market={m} initial={initial(m, "brand=brand01")} />);
    expect(screen.queryByText("ALPHA-20%x")).toBeNull();
    expect(screen.getByText("B10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove brand filter: Brand01" }));
    expect(screen.getByText("ALPHA-20%x")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("shows no sample label anywhere", () => {
    const m = market({ coupons: many() });
    const { container } = render(<DealsMarket market={m} initial={initial(m)} />);
    expect(container.textContent).not.toMatch(/sample/i);
  });

  it("starts from the state in the URL", () => {
    const m = market({ coupons: many() });
    render(<DealsMarket market={m} initial={initial(m, "category=ai-writing&sort=brand")} />);
    expect(document.querySelectorAll(".deal-row")).toHaveLength(15);
    expect(screen.getByLabelText("Sort by")).toHaveValue("brand");
  });

  it("puts the filters behind one labelled toggle for small screens", () => {
    const m = market({ coupons: many() });
    render(<DealsMarket market={m} initial={initial(m, "check=source_verified")} />);
    const toggle = screen.getByRole("button", { name: "Filters (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toHaveAttribute("data-open", "true");
    for (const select of document.querySelectorAll("select")) expect(document.querySelector(`label[for="${select.id}"]`)).not.toBeNull();
  });

  it("words result counts plainly", () => {
    expect(countLine(73, 24, true, "deal")).toBe("Showing 24 of 73 matching deals");
    expect(countLine(1, 24, false, "coupon")).toBe("1 coupon");
    expect(countLine(1257, 24, false, "brand")).toBe("Showing 24 of 1,257 brands");
  });
});

describe("Blog routes carry no coupon widgets", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });

  it("never import a code, copy control or coupon card", () => {
    const blog = files(path.join(process.cwd(), "src", "app", "(site)", "blog")).concat(files(path.join(process.cwd(), "src", "components", "blog")));
    expect(blog.length).toBeGreaterThan(0);
    for (const f of blog) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\b(CopyCode|CouponCard|DealRow|DealList|DealTicket|DealsMarket)\b/);
      expect(src, f).not.toMatch(/\.code\b/);
    }
  });
});
