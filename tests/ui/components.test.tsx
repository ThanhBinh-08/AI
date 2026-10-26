import { act, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/deals/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { CopyCode } from "@/components/ui/CopyCode";
import { GoLink, VerificationStatus } from "@/components/ui/bits";
import { DealMentions } from "@/components/cards/cards";
import { STATIC_PAGES } from "@/content/pages";

afterEach(() => vi.unstubAllGlobals());

describe("Header", () => {
  beforeEach(() => {
    pathname = "/deals/";
  });

  it("marks the current section and has no dead links", () => {
    render(<Header siteName="Test" />);
    const main = screen.getByRole("navigation", { name: "Main" });
    const current = main.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("Deals");
    for (const a of document.querySelectorAll("a")) {
      const href = a.getAttribute("href") ?? "";
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toContain("#");
    }
    expect(screen.queryByText(/sign in/i)).toBeNull();
  });

  it("opens and closes the mobile menu with the burger and Escape", () => {
    render(<Header siteName="Test" />);
    const burger = screen.getByRole("button", { name: "Open menu" });
    expect(burger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("mobileMenu")).toHaveAttribute("hidden");
    fireEvent.click(burger);
    expect(burger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("mobileMenu")).not.toHaveAttribute("hidden");
    expect(document.body.classList.contains("menu-open")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(burger).toHaveAttribute("aria-expanded", "false");
    expect(document.body.classList.contains("menu-open")).toBe(false);
  });
});

/** Turns "/blog/" into the folder that serves it, so every footer link is checked against a real route. */
function routeExists(href: string): boolean {
  const app = path.join(process.cwd(), "src", "app");
  const seg = href.replace(/^\/|\/$/g, "");
  if (seg === "") return true;
  if (STATIC_PAGES.some((p) => p.slug === seg)) return true;
  const search = (dir: string): boolean => {
    if (existsSync(path.join(dir, seg, "page.tsx")) || existsSync(path.join(dir, seg, "(list)", "page.tsx"))) return true;
    return readdirSync(dir, { withFileTypes: true }).some((d) => d.isDirectory() && d.name.startsWith("(") && search(path.join(dir, d.name)));
  };
  return search(app);
}

describe("Footer", () => {
  it("links only to routes that exist, including all legal pages", () => {
    render(<Footer siteName="Test" description="d" year={2026} />);
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")!);
    for (const href of hrefs) expect(routeExists(href), href).toBe(true);
    for (const legal of ["/affiliate-disclosure/", "/privacy-policy/", "/terms/", "/disclaimer/", "/cookie-policy/"]) expect(hrefs).toContain(legal);
    expect(screen.getByText(/© 2026 Test/)).toBeInTheDocument();
  });
});

describe("CopyCode", () => {
  it("copies the code and says so", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<CopyCode code="SAVE20" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy code SAVE20" }));
    });
    expect(writeText).toHaveBeenCalledWith("SAVE20");
    expect(screen.getByRole("button")).toHaveTextContent("Copied");
    expect(screen.getByRole("status")).toHaveTextContent("Code SAVE20 copied");
  });

  it("tells the user to copy by hand when the clipboard is blocked", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) } });
    render(<CopyCode code="SAVE20" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(/copy it manually/);
  });
});

describe("GoLink and status", () => {
  it("is a sponsored /go/ link labelled for measurement, or a note (no button, no substitute URL) without one", () => {
    const { rerender } = render(<GoLink brandId="quill" enabled offer="Q1" from="tool-offer">Get Deal</GoLink>);
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("href", "/go/quill/?o=Q1&p=tool-offer");
    expect(a.getAttribute("rel")).toContain("sponsored");
    expect(a).toHaveAttribute("data-track", "affiliate_click");
    expect(a).toHaveAttribute("data-offer", "Q1");
    rerender(<GoLink brandId="quill" enabled={false}>Get Deal</GoLink>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("No partner link yet")).toBeInTheDocument();
  });

  it("names deals in articles without a code, a copy button or an outbound link", () => {
    const deal = {
      id: "Q1", slug: "quillwise-q1", brandId: "quill", code: "SAVE20", discount: "20% off", title: "Annual plan", terms: "", expiresAt: null,
      sourceHost: null, verification: "source_verified", verifiedAt: "2026-10-20", status: "published", active: true,
      brand: { id: "quill", name: "Quillwise", slug: "quillwise", logoUrl: null, description: "", categories: [], domain: null, status: "published", programStatus: "approved", hasAffiliate: true, updatedAt: null },
    } as const;
    render(<DealMentions deals={[deal as never]} />);
    expect(screen.queryByText("SAVE20")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/deals/quillwise-q1/");
  });

  it("states verification in words, not only colour", () => {
    render(<VerificationStatus value="checkout_tested" at="2026-10-20" />);
    expect(screen.getByText("Tested at checkout Oct 20, 2026")).toBeInTheDocument();
  });
});

describe("deal ticket helpers", () => {
  it("splits the discount into a big number and a label", async () => {
    const { splitDiscount } = await import("@/components/cards/cards");
    expect(splitDiscount("30% off")).toEqual(["30%", "off"]);
    expect(splitDiscount("2 months free")).toEqual(["2", "months free"]);
    expect(splitDiscount("$100 credit")).toEqual(["$100", "credit"]);
    expect(splitDiscount("Free")).toEqual(["Free", ""]);
  });

  it("words the end date relative to today only when it is close", async () => {
    const { endsLabel } = await import("@/components/cards/cards");
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    expect(endsLabel(null)).toEqual({ text: "No end date published", urgent: false });
    expect(endsLabel(day(0))).toEqual({ text: "Ends today", urgent: true });
    expect(endsLabel(day(1))).toEqual({ text: "Ends tomorrow", urgent: true });
    expect(endsLabel(day(5))).toEqual({ text: "Ends in 5 days", urgent: true });
    expect(endsLabel(day(12))).toEqual({ text: "Ends in 12 days", urgent: false });
    expect(endsLabel(day(40)).text).toMatch(/^Ends [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });
});
