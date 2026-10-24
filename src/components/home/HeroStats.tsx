"use client";

import { useEffect, useRef } from "react";

export interface Stat {
  icon: string;
  value: number;
  label: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The original stats footer and its count-up (easeOutCubic, 1500 ms + 80 ms per item, 480 ms + 90 ms delay,
 * started once by an IntersectionObserver at 25 %). The numbers are live counts from the catalog.
 * Server HTML already contains the final numbers, so crawlers and no-JS visitors see them.
 */
export function HeroStats({ stats }: { stats: Stat[] }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const footer = ref.current;
    if (!footer) return;
    const values = Array.from(footer.querySelectorAll<HTMLElement>(".stat-value"));
    const timers: number[] = [];
    const frames: number[] = [];
    let started = false;

    const animate = (el: HTMLElement, index: number) => {
      const target = Number(el.dataset.target) || 0;
      const duration = 1500 + index * 80;
      const delay = 480 + index * 90;
      el.textContent = "0";
      timers.push(
        window.setTimeout(() => {
          let start: number | null = null;
          const step = (ts: number) => {
            start ??= ts;
            const progress = Math.min((ts - start) / duration, 1);
            el.textContent = String(Math.round(easeOutCubic(progress) * target));
            if (progress < 1) frames.push(requestAnimationFrame(step));
            else el.textContent = String(target);
          };
          frames.push(requestAnimationFrame(step));
        }, delay),
      );
    };

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            started = true;
            obs.unobserve(entry.target);
            values.forEach(animate);
          }
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(footer);
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
      values.forEach((el) => (el.textContent = el.dataset.target ?? el.textContent));
    };
  }, []);

  return (
    <footer className="stats-footer" ref={ref} aria-label="What is listed right now">
      <div className="stats-grid">
        {stats.map((s, i) => (
          <div key={s.label} className="stat-item anim" style={{ ["--d" as string]: `${0.5 + i * 0.08}s` }}>
            <div className="stat-main">
              <span className="stat-icon" aria-hidden="true">
                {s.icon}
              </span>
              <span className="stat-value" data-target={s.value}>
                {s.value}
              </span>
            </div>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </footer>
  );
}
