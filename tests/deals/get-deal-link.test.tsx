import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GetDealLink } from "@/components/deals/GetDealLink";

const REVEAL = { slug: "quill-30", title: "Quill 30% off", brandName: "Quill", discount: "30% off", code: "QUILL30", terms: "", expiresAt: null, goHref: "/go/quill/" };

function link(props: Partial<React.ComponentProps<typeof GetDealLink>> = {}) {
  return render(
    <GetDealLink href="/go/quill/?o=d1" slug="quill-30" className="btn" {...props}>
      Get Deal
    </GetDealLink>,
  );
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(REVEAL)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

describe("GetDealLink", () => {
  it("on a list opens the deal page in a new tab, with no popup and no fetch", () => {
    const tab = { opener: {} as unknown };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as Window);
    link();
    fireEvent.click(screen.getByRole("link"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("/deals/quill-30/#get", "_blank");
    expect(tab.opener).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("with the tab blocked shows the code popup in place", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    link();
    await act(async () => {
      fireEvent.click(screen.getByRole("link"));
    });
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/coupons/quill-30", expect.anything());
    expect(await screen.findByText("QUILL30")).toBeTruthy();
  });

  it("opens the popup once on arrival with #get and clears the hash", async () => {
    history.replaceState(null, "", "/deals/quill-30/#get");
    await act(async () => {
      link({ openOnArrival: true });
    });
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(window.location.hash).toBe("");
  });
});
