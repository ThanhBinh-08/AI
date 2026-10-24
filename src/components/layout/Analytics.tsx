"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { CONSENT_KEY, createTracker, OPT_OUT_KEY, pageTypeOf, readConfig, trackingAllowed, type EventName } from "@/lib/analytics";

type PlausibleFn = (name: string, opts?: { props?: Record<string, string> }) => void;
declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
  }
}

const CHANGE = "analytics-choice";

function storage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Loads the analytics script and wires the three conversion events, only when configured and allowed
 * (see src/lib/analytics.ts). Renders nothing otherwise. Elements opt in with data attributes:
 *   data-track="affiliate_click" | "copy_code" (on the button or link), data-impression (on a coupon card),
 *   plus data-brand, data-offer, data-placement.
 */
export function Analytics() {
  const cfg = useMemo(() => readConfig(), []);
  const pathname = usePathname();

  // "off" | "on" | "ask": read from the browser; the server always renders "off".
  const state = useSyncExternalStore(
    subscribe,
    () => {
      if (!cfg.provider) return "off";
      const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
      const c = storage(CONSENT_KEY);
      const signals = {
        doNotTrack: nav.doNotTrack === "1" || nav.globalPrivacyControl === true,
        optedOut: storage(OPT_OUT_KEY) === "1",
        consent: c === "granted" || c === "denied" ? c : null,
      } as const;
      if (trackingAllowed(cfg, signals)) return "on";
      return cfg.consentRequired && signals.consent === null && !signals.doNotTrack && !signals.optedOut ? "ask" : "off";
    },
    () => "off",
  );
  const allowed = state === "on";

  const tracker = useMemo(
    () =>
      createTracker((name, props) => {
        // window.plausible is a queue (see the inline snippet) until the script has loaded.
        window.plausible?.(name, { props: props as unknown as Record<string, string> });
      }),
    [],
  );

  // Clicks and copies, by delegation, so server components only need data attributes.
  useEffect(() => {
    if (!allowed) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track]");
      if (!el) return;
      const name = el.dataset.track as EventName;
      if (name !== "affiliate_click" && name !== "copy_code") return;
      tracker.track(name, { page_type: pageTypeOf(window.location.pathname), brand: el.dataset.brand, offer: el.dataset.offer, placement: el.dataset.placement });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [allowed, tracker]);

  // Coupon impressions: half visible, once per coupon per page view.
  useEffect(() => {
    if (!allowed || typeof IntersectionObserver === "undefined") return;
    tracker.newPage();
    const page_type = pageTypeOf(pathname);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          tracker.track("coupon_impression", { page_type, brand: el.dataset.brand, offer: el.dataset.offer, placement: el.dataset.placement });
          io.unobserve(el);
        }
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll("[data-impression]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [allowed, pathname, tracker]);

  if (state === "off") return null;

  return (
    <>
      {allowed ? (
        <>
          <Script id="plausible-queue" strategy="afterInteractive">
            {"window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}"}
          </Script>
          <Script src="https://plausible.io/js/script.js" data-domain={cfg.domain!} strategy="afterInteractive" />
        </>
      ) : (
        <div className="consent" role="dialog" aria-label="Analytics choice">
          <p>
            May we count page views and clicks on deals, without cookies or personal data? It helps us see which deals are useful.{" "}
            <Link href="/privacy-policy/">Privacy policy</Link>
          </p>
          <div className="consent-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => remember(CONSENT_KEY, "granted")}>
              Allow counting
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remember(CONSENT_KEY, "denied")}>
              No thanks
            </button>
          </div>
        </div>
      )}
    </>
  );
}
