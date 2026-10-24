import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { breadcrumbs, serializeJsonLd } from "@/lib/jsonld";
import { headingsOf, Markdown, safeHref } from "@/lib/markdown";

describe("Markdown", () => {
  it("renders raw HTML as text, never as elements", () => {
    const { container } = render(<Markdown source={"Hello <script>alert(1)</script> <img src=x onerror=alert(1)>"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("drops javascript: and data: links but keeps site and https links", () => {
    const { container } = render(<Markdown source={"[a](javascript:alert(1)) [b](data:text/html,x) [c](/deals/) [d](https://example.org/) [e](//evil.com)"} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/deals/", "https://example.org/"]);
    expect(container.textContent).toContain("a");
  });

  it("renders headings, lists and emphasis", () => {
    const { container } = render(<Markdown source={"## Title one\n\n- **bold** item\n- *em* item\n\n1. first\n2. second"} />);
    expect(container.querySelector("h2")?.id).toBe("title-one");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("lists headings for a table of contents", () => {
    expect(headingsOf("## A\ntext\n### B")).toEqual([
      { id: "a", text: "A", level: 2 },
      { id: "b", text: "B", level: 3 },
    ]);
  });

  it("safeHref", () => {
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeHref("http://example.org")).toBeNull();
  });
});

describe("JSON-LD", () => {
  it("cannot close its script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });

  it("builds a breadcrumb list with absolute URLs", () => {
    const b = breadcrumbs("https://x.org", [
      { name: "Home", path: "/" },
      { name: "Deals", path: "/deals/" },
    ]);
    expect(b.itemListElement[1]).toEqual({ "@type": "ListItem", position: 2, name: "Deals", item: "https://x.org/deals/" });
  });
});
