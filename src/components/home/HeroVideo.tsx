"use client";

import { useEffect, useRef } from "react";

/**
 * The original background video, now served from /public/media (13.8 MB source re-encoded to 1.7 MB / 0.46 MB).
 * The poster is the first frame, so the first paint already shows the glow; it is preloaded by the page.
 * Like the original main.js, the video always plays (the owner's design keeps it moving).
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Same autoplay assurance as the original main.js.
    video.muted = true;
    const p = video.play();
    if (p !== undefined) {
      p.catch(() => {
        document.body.addEventListener("click", () => void video.play().catch(() => {}), { once: true });
      });
    }
  }, []);

  return (
    <div className="bg" aria-hidden="true">
      <video ref={ref} className="bg-video" autoPlay muted loop playsInline preload="auto" poster="/media/hero-poster.webp">
        <source src="/media/hero-720.mp4" type="video/mp4" media="(max-width: 900px)" />
        <source src="/media/hero-1080.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
