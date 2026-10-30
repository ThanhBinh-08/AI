"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DealCodeDialog } from "@/components/deals/DealCodeDialog";
import { useRevealDealCode } from "@/components/deals/DealCodeBox";
import { openDealTab } from "@/lib/deal-tab";

/**
 * The Get Deal button of a coupon. Still a real link to /go/<brandId>/ (new tab without JavaScript), but a press does,
 * on every page including the deal's own: the deal's page opens in a new tab with the code popup, and this tab goes to
 * the store through /go/. If the new tab is blocked, nothing leaves the page and the popup opens here.
 * `openOnArrival` (the deal page's main button only) opens the popup once when the page was opened with #get.
 */
export function GetDealLink({ href, slug, openOnArrival, className, brand, offer, from, children }: {
  href: string;
  slug: string;
  openOnArrival?: boolean;
  className: string;
  brand?: string;
  offer?: string | null;
  from?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // On the deal page the code box beside the button shows the code; elsewhere (or without it) the popup does.
  const revealHere = useRevealDealCode();

  useEffect(() => {
    if (!openOnArrival || window.location.hash !== "#get") return;
    // Clearing the hash first keeps React StrictMode's second effect run quiet and a reload from reopening it.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    // The state change syncs with the URL hash, which the server render cannot know.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (revealHere) revealHere();
    else setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [openOnArrival, revealHere]);

  function press(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle Ctrl/Cmd/Shift/middle clicks: the visitor chose where the link goes.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (!openDealTab(slug, href)) {
      if (revealHere) revealHere();
      else setOpen(true);
    }
  }

  return (
    <>
      <a
        className={className}
        href={href}
        rel="sponsored nofollow noopener"
        target="_blank"
        onClick={press}
        data-track="affiliate_click"
        data-brand={brand}
        data-offer={offer ?? undefined}
        data-placement={from}
      >
        {children}
        <span className="sr-only"> (opens the code, then the brand&apos;s site)</span>
      </a>
      <DealCodeDialog slug={slug} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
