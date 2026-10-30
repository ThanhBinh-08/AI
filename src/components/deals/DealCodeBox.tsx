"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DealCodeDialog } from "@/components/deals/DealCodeDialog";
import { CopyCode } from "@/components/ui/CopyCode";
import { openDealTab } from "@/lib/deal-tab";

const RevealContext = createContext<(() => void) | null>(null);

/** Lets the deal page's Get Deal button show the code box next to it: both read and set the same "revealed" flag. */
export function useRevealDealCode(): (() => void) | null {
  return useContext(RevealContext);
}

const Revealed = createContext(false);

/**
 * Wraps the offer panel of a deal page. Revealing (Reveal Code, Get Deal, or arriving with #get) opens the code popup
 * and shows the code box. The code is not in the page: both fetch it when first revealed.
 */
export function DealRevealProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const [popup, setPopup] = useState(false);
  return (
    <RevealContext.Provider
      value={() => {
        setRevealed(true);
        setPopup(true);
      }}
    >
      <Revealed.Provider value={revealed}>{children}</Revealed.Provider>
      <DealCodeDialog slug={slug} open={popup} onClose={() => setPopup(false)} />
    </RevealContext.Provider>
  );
}

type Load = { status: "loading" } | { status: "ready"; code: string | null } | { status: "error" };

/**
 * The code area of a deal page: a Reveal Code button until Reveal Code or Get Deal has been pressed, then the code
 * with a copy icon. Reveal Code works like Get Deal (`href`): the deal page reopens in a new tab, this tab goes to the store.
 */
export function DealCodeBox({ slug, href, brand, offer }: { slug: string; href: string | null; brand: string; offer: string }) {
  const revealed = useContext(Revealed);
  const reveal = useContext(RevealContext);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    if (!revealed) return;
    let live = true;
    fetch(`/api/coupons/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ code: string | null }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setLoad({ status: "ready", code: d.code }))
      .catch(() => live && setLoad({ status: "error" }));
    return () => {
      live = false;
    };
  }, [revealed, slug]);

  function press() {
    // Same as Get Deal, inside the click handler so no pop-up blocker objects: this deal page opens again in a new tab
    // with the popup and this tab goes to the store. Blocked tab or no link: the popup and the code open here.
    if (href?.startsWith("/go/") && openDealTab(slug, href)) return;
    reveal?.();
  }

  if (!revealed) {
    return (
      <button
        type="button"
        className="reveal-btn reveal-btn-lg"
        onClick={press}
        data-track={href ? "affiliate_click" : "copy_code"}
        data-brand={brand}
        data-offer={offer}
        data-placement="deal-page"
      >
        Reveal Code
        {href ? <span className="sr-only"> (also opens the brand&apos;s site in a new tab)</span> : null}
      </button>
    );
  }
  if (load.status === "loading") return <span className="code-skeleton" aria-busy="true" />;
  if (load.status === "error") return <p className="muted">The code could not be loaded. Reload the page and try again.</p>;
  if (!load.code) return null;
  return <CopyCode code={load.code} size="lg" icon brand={brand} offer={offer} placement="deal-page" />;
}
