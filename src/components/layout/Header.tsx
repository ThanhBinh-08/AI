"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NAV } from "@/config/site";

/** Same breakpoint as the CSS that swaps the nav pill for the burger (hero.css, max-width: 720px). */
const MOBILE_MAX = 720;

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href) || pathname === href.replace(/\/$/, "");
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Pill header from the original design. The mobile menu keeps the original behaviour from main.js:
 * burger toggles aria-expanded, overlay click / Escape / link click / resize past the breakpoint close it.
 */
export function Header({ siteName }: { siteName: string }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // A route change (link click, back button) closes the menu: reset during render, not in an effect.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (open && openedOn !== pathname) {
    setOpen(false);
  }

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) burgerRef.current?.focus();
  }, []);

  // The body class locks page scroll while the menu is open (hero.css: body.menu-open).
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onResize = () => {
      if (window.innerWidth > MOBILE_MAX) close();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const searchActive = pathname.startsWith("/search");

  return (
    <>
      <header className="site-header">
        <Link href="/" className="logo-btn" aria-label={`${siteName} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 5 KB static logo, fixed size */}
          <img src="/brand/logo.webp" alt="" width={52} height={52} className="logo-img" />
        </Link>

        <nav className="nav-pill" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link href="/search/" className="header-search" aria-label="Search" aria-current={searchActive ? "page" : undefined}>
          <SearchIcon />
        </Link>

        <button
          ref={burgerRef}
          type="button"
          className="burger-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobileMenu"
          onClick={() => {
            if (open) close();
            else {
              setOpenedOn(pathname);
              setOpen(true);
            }
          }}
        >
          <span className="burger-bar" />
          <span className="burger-bar" />
          <span className="burger-bar" />
        </button>
      </header>

      <div className="mobile-overlay" hidden={!open} onClick={() => close()} />
      <div className="mobile-menu" id="mobileMenu" hidden={!open} ref={menuRef}>
        <nav className="mobile-nav" aria-label="Mobile">
          {[...NAV, { href: "/search/", label: "Search" }].map((item) => {
            const active = item.href === "/search/" ? searchActive : isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => close()}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
