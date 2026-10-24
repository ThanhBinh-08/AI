"use client";

import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

/**
 * Copies the exact stored coupon code. The code stays visible and selectable, so it can always be copied by hand;
 * pressing Copy never navigates. `brand`/`offer`/`placement` only label the copy for measurement.
 */
export function CopyCode({ code, size, tone, brand, offer, placement }: {
  code: string;
  size?: "lg";
  tone?: "paper";
  brand?: string;
  offer?: string;
  placement?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

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

  const label = state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy";
  return (
    <span className={`code-copy${size ? ` ${size}` : ""}${tone ? ` ${tone}` : ""}`}>
      <code>{code}</code>
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
        {label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `Code ${code} copied` : state === "failed" ? "Copy failed. Select the code and copy it manually." : ""}
      </span>
    </span>
  );
}
