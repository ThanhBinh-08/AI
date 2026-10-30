import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealCodeBox, DealRevealProvider } from "@/components/deals/DealCodeBox";
import { GetDealLink } from "@/components/deals/GetDealLink";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "QUILL30" })));
  vi.spyOn(window, "open").mockReturnValue({ opener: {} } as Window);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

function page() {
  return render(
    <DealRevealProvider slug="quill-30">
      <DealCodeBox slug="quill-30" href="/go/quill/" brand="quill" offer="d1" />
      <GetDealLink href="/go/quill/" slug="quill-30" openOnArrival className="btn">
        Get Deal
      </GetDealLink>
    </DealRevealProvider>,
  );
}

describe("deal page code box", () => {
  it("hides the code until a press; a press reopens the deal page in a new tab (with the popup) instead of revealing here", async () => {
    const { container } = page();
    expect(container.textContent).not.toContain("QUILL30");
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reveal Code/ }));
    });
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith("/deals/quill-30/#get", "_blank");
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("QUILL30");
  });

  it("with the tab blocked reveals the code and the popup in place, with a copy icon", async () => {
    vi.mocked(window.open).mockReturnValue(null);
    page();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reveal Code/ }));
    });
    expect((await screen.findAllByText("QUILL30")).length).toBeGreaterThan(0);
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Copy code QUILL30" })[0]!.querySelector("svg")).not.toBeNull();
  });

  it("Get Deal on the deal page also reopens the deal page in a new tab", async () => {
    page();
    fireEvent.click(screen.getByRole("link", { name: /Get Deal/ }));
    expect(window.open).toHaveBeenCalledWith("/deals/quill-30/#get", "_blank");
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("shows the code on arrival with #get", async () => {
    history.replaceState(null, "", "/deals/quill-30/#get");
    await act(async () => {
      page();
    });
    expect((await screen.findAllByText("QUILL30")).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe("");
  });
});
