"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isCouponFreeRoute } from "@/lib/coupon-rules";

type CopyState = "idle" | "copied" | "failed";

/**
 * Copies the exact stored coupon code. The code stays visible and selectable, so it can always be copied by hand;
 * pressing Copy never navigates. `brand`/`offer`/`placement` only label the copy for measurement.
 * On Blog routes it renders nothing: articles never carry a code or a copy control.
 */
export function CopyCode({ code, size, tone, icon, brand, offer, placement }: {
  code: string;
  /** The button is a copy icon instead of the word, leaving the room to the code. */
  icon?: boolean;
  size?: "lg";
  tone?: "paper";
  brand?: string;
  offer?: string;
  placement?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  const pathname = usePathname();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  }

  if (isCouponFreeRoute(pathname)) return null;

  const label = state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy";
  return (
    <span className={`code-copy${size ? ` ${size}` : ""}${tone ? ` ${tone}` : ""}${icon ? " icon" : ""}`}>
      <code title={code}>{code}</code>
      <button
        type="button"
        onClick={copy}
        data-state={state}
        aria-label={`Copy code ${code}`}
        data-track="copy_code"
        data-brand={brand}
        data-offer={offer}
        data-placement={placement}
      >
        {icon ? <CopyIcon done={state === "copied"} /> : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `Code ${code} copied` : state === "failed" ? "Copy failed. Select the code and copy it manually." : ""}
      </span>
    </span>
  );
}

function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {done ? (
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      ) : (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2.5" />
          <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
        </>
      )}
    </svg>
  );
}
