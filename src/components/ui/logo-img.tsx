"use client";

import { useState } from "react";

/** The logo image; when the brand's host blocks hotlinking or the file is gone, the placeholder shows instead. */
export function LogoImg({ src, name, px, fallback }: { src: string; name: string; px: number; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="monogram" aria-hidden="true">
        {fallback}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts; fixed size, lazy
    <img src={src} alt={`${name} logo`} width={px} height={px} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
