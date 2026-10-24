"use client";

import { useEffect, useRef, useState } from "react";

/** Copies the page address. The address stays visible to assistive tech through the status message. */
export function CopyLink({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Copy link"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed. Copy the address from the browser bar." : ""}
      </span>
    </>
  );
}
