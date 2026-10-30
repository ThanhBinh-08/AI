"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DealCodeDialog } from "@/components/deals/DealCodeDialog";
import { isCouponFreeRoute } from "@/lib/coupon-rules";
import { openDealTab } from "@/lib/deal-tab";

type CopyState = "idle" | "copied" | "failed";

/**
 * "Reveal Code": one press shows the exact stored code and copies it. The code then stays visible and selectable, with
 * a Copy button for another try. With a deal link (`slug` + `href`) a press works like Get Deal instead: the deal page with
 * its code popup opens in a new tab and this tab goes to the store; the code shows in place only if that tab is blocked.
 * Without JavaScript the code is shown as plain text.
 * Renders nothing on Blog routes, like CopyCode. `brand`/`offer`/`placement` only label the copy for measurement.
 */
export function RevealCode({ code, slug, href, brand, offer, placement, label }: {
  /** The exact code, for a card that shows it in place. Omitted, the code only ever comes from the popup (/api/coupons). */
  code?: string;
  /** The deal's slug. With `href`, a press behaves exactly like Get Deal: see GetDealLink. */
  slug?: string;
  /** The deal's /go/ link. Without one there is nowhere to go, so the code is only shown and copied in place. */
  href?: string | null;
  brand?: string;
  offer?: string;
  placement?: string;
  /** What the code is for, read by screen readers: "Quill 30% off". */
  label: string;
}) {
  const [shown, setShown] = useState(false);
  const [popup, setPopup] = useState(false);
  const [state, setState] = useState<CopyState>("idle");
  const copyRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pathname = usePathname();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The reveal button goes away; keep the keyboard on the Copy button that replaces it.
  useEffect(() => {
    if (shown) copyRef.current?.focus();
  }, [shown]);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2400);
  }

  async function reveal() {
    // Same click handler, before any await, so no pop-up blocker objects. Like Get Deal: the deal page (with the code
    // popup) opens in a new tab and this tab goes to the store. Blocked tab or no link: the code is shown here.
    if (slug && href?.startsWith("/go/") && openDealTab(slug, href)) return;
    if (!code) {
      setPopup(true);
      return;
    }
    setShown(true);
    await copy();
  }

  if (isCouponFreeRoute(pathname)) return null;

  const track = { "data-track": "copy_code", "data-brand": brand, "data-offer": offer, "data-placement": placement };
  // The first press leaves for the store like Get Deal, so it is counted as an affiliate click; Copy afterwards stays copy_code.
  const revealTrack = href ? { ...track, "data-track": "affiliate_click" } : track;

  return (
    <span className="reveal" data-shown={shown ? "true" : undefined}>
      {shown ? (
        <span className="reveal-code">
          <code>{code}</code>
          <button ref={copyRef} type="button" onClick={copy} data-state={state} aria-label={`Copy code ${code}`} {...track}>
            {state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy"}
          </button>
        </span>
      ) : (
        <>
          <button type="button" className="reveal-btn" onClick={reveal} aria-label={`Reveal and copy the code for ${label}${href ? ", and open the brand's site in a new tab" : ""}`} {...revealTrack}>
            Reveal Code
          </button>
          {code ? (
            <noscript>
              <span className="reveal-code">
                <code>{code}</code>
              </span>
            </noscript>
          ) : null}
        </>
      )}
      {!code && slug ? <DealCodeDialog slug={slug} open={popup} onClose={() => setPopup(false)} /> : null}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `Code ${code} copied` : state === "failed" ? `Code ${code} shown. Copy failed: select the code and copy it manually.` : ""}
      </span>
    </span>
  );
}
