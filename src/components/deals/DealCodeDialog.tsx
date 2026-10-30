"use client";

import { useEffect, useRef, useState } from "react";
import { formatDay } from "@/lib/dates";

interface Reveal {
  title: string;
  brandName: string;
  discount: string;
  code: string | null;
  terms: string;
  expiresAt: string | null;
  goHref: string | null;
}

type Load = { status: "loading" } | { status: "ready"; deal: Reveal } | { status: "error" };

/**
 * The code popup of a deal: a native modal <dialog>, centred at every width. The data is fetched from
 * /api/coupons/<slug> when it first opens and kept, so closing and opening again does not fetch twice.
 * A deal without a code shows no code box. "Continue to store" is the fallback when the tab could not be opened.
 */
export function DealCodeDialog({ slug, open, onClose }: { slug: string; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const fetched = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.focus({ preventScroll: true });
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open || fetched.current) return;
    fetched.current = true;
    fetch(`/api/coupons/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Reveal>) : Promise.reject(new Error(String(r.status)))))
      .then((deal) => setLoad({ status: "ready", deal }))
      .catch(() => {
        fetched.current = false;
        setLoad({ status: "error" });
      });
  }, [open, slug]);

  function dismiss() {
    ref.current?.close();
    onClose();
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  const deal = load.status === "ready" ? load.deal : null;
  return (
    <dialog ref={ref} className="code-popup" tabIndex={-1} aria-labelledby={`cp-${slug}`} onClose={onClose} onClick={(e) => e.target === ref.current && dismiss()}>
      <div className="code-popup-body">
        <button type="button" className="code-popup-close" onClick={dismiss} aria-label="Close">
          ×
        </button>
        {load.status === "loading" ? (
          <div className="code-popup-skeleton" aria-busy="true">
            <span />
            <span />
          </div>
        ) : null}
        {load.status === "error" ? <p id={`cp-${slug}`}>The code could not be loaded. Close this and try again.</p> : null}
        {deal ? (
          <>
            <p className="code-popup-store">{deal.brandName}</p>
            <h2 id={`cp-${slug}`}>{deal.title || `${deal.discount} at ${deal.brandName}`}</h2>
            {deal.code ? (
              <div className="code-popup-code">
                <code onClick={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}>{deal.code}</code>
                <button type="button" className="btn btn-dark btn-sm" onClick={() => copy(deal.code!)} data-track="copy_code" data-offer={slug} data-placement="code-popup">
                  {copied === "copied" ? "Copied" : copied === "failed" ? "Select it" : "Copy code"}
                </button>
              </div>
            ) : (
              <p className="muted">No code needed: the discount applies on {deal.brandName}&apos;s site.</p>
            )}
            <p className="code-popup-meta">
              {deal.discount}
              {deal.expiresAt ? ` · Ends ${formatDay(deal.expiresAt)}` : " · No end date published"}
            </p>
            {deal.terms ? <p className="code-popup-terms">{deal.terms}</p> : null}
            {deal.goHref ? (
              <a className="btn btn-primary" href={deal.goHref} target="_blank" rel="sponsored nofollow noopener" data-track="affiliate_click" data-offer={slug} data-placement="code-popup">
                Continue to Store<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </>
        ) : null}
        <span className="sr-only" role="status" aria-live="polite">
          {copied === "copied" ? "Code copied" : ""}
        </span>
      </div>
    </dialog>
  );
}
