"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isCouponFreeRoute } from "@/lib/coupon-rules";

type CopyState = "idle" | "copied" | "failed";

/**
 * "Reveal Code": one press shows the exact stored code and copies it. The code then stays visible and selectable, with
 * a Copy button for another try. Nothing navigates. Without JavaScript the code is shown as plain text.
 * Renders nothing on Blog routes, like CopyCode. `brand`/`offer`/`placement` only label the copy for measurement.
 */
export function RevealCode({ code, brand, offer, placement, label }: {
  code: string;
  brand?: string;
  offer?: string;
  placement?: string;
  /** What the code is for, read by screen readers: "Quill 30% off". */
  label: string;
}) {
  const [shown, setShown] = useState(false);
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
    setShown(true);
    await copy();
  }

  if (isCouponFreeRoute(pathname)) return null;

  const track = { "data-track": "copy_code", "data-brand": brand, "data-offer": offer, "data-placement": placement };

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
          <button type="button" className="reveal-btn" onClick={reveal} aria-label={`Reveal and copy the code for ${label}`} {...track}>
            Reveal Code
          </button>
          <noscript>
            <span className="reveal-code">
              <code>{code}</code>
            </span>
          </noscript>
        </>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `Code ${code} copied` : state === "failed" ? `Code ${code} shown. Copy failed: select the code and copy it manually.` : ""}
      </span>
    </span>
  );
}
