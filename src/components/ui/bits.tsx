import Link from "next/link";
import type { ReactNode } from "react";
import { formatDay } from "@/lib/dates";
import { serializeJsonLd } from "@/lib/jsonld";
import tones from "@/config/logo-tones.json";
import { LogoImg } from "@/components/ui/logo-img";
import { monogram } from "@/lib/text";
import { goHref, type Placement } from "@/lib/go";
import type { Verification } from "@/types/catalog";

export function JsonLd({ data }: { data: unknown }) {
  // serializeJsonLd escapes "<", so Sheet text cannot close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

/**
 * Brand logo on a disc; a two-letter placeholder when there is no verified logo. The disc follows the logo's tone
 * (npm run db:fetch-logos): a dark logo gets a bright lit disc, a white logo a deep one, an app icon its own tile.
 */
export function BrandLogo({ name, src, size }: { name: string; src: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const px = size === "xl" ? 136 : size === "lg" ? 88 : size === "sm" ? 40 : size === "md" ? 56 : 52;
  return (
    <span className={`logo-disc${size ? ` ${size}` : ""}`} data-tone={src ? (tones as Record<string, string>)[src] : undefined}>
      {src ? (
        <LogoImg src={src} name={name} px={px} fallback={monogram(name)} />
      ) : (
        <span className="monogram" aria-hidden="true">
          {monogram(name)}
        </span>
      )}
    </span>
  );
}

const STATUS_TEXT: Record<Verification, string> = {
  checkout_tested: "Tested at checkout",
  source_verified: "Source checked",
  unverified: "Not yet checked",
};

const STATUS_CLASS: Record<Verification, string> = { checkout_tested: "tested", source_verified: "source", unverified: "unverified" };

export function VerificationStatus({ value, at, expired }: { value: Verification; at: string | null; expired?: boolean }) {
  if (expired) return <span className="status expired">Expired</span>;
  return (
    <span className={`status ${STATUS_CLASS[value]}`}>
      {STATUS_TEXT[value]}
      {at && value !== "unverified" ? ` ${formatDay(at)}` : ""}
    </span>
  );
}

/**
 * Outbound CTA to the brand's one approved affiliate URL through /go/<brandId>/ (validated server-side; the
 * query only labels the click). Without an approved link there is no button and no substitute URL: a quiet
 * "No partner link yet" note stands in its place, so a dead button is never presented as working.
 */
export function GoLink({ brandId, enabled, children, variant = "primary", size, offer, from }: {
  brandId: string;
  enabled: boolean;
  children: ReactNode;
  variant?: "primary" | "dark" | "ghost";
  size?: "sm";
  /** The deal this click is for, when there is one. */
  offer?: string | null;
  from?: Placement;
}) {
  return (
    <OutboundLink href={enabled ? goHref(brandId, { offer, from }) : null} variant={variant} size={size} brand={brandId} offer={offer} from={from}>
      {children}
    </OutboundLink>
  );
}

/**
 * The outbound anchor itself, for callers that already hold a /go/ link (built server-side by goHref). `href` null →
 * the "no partner link" note, never a substitute destination.
 */
export function OutboundLink({ href, children, variant = "primary", size, brand, offer, from, unavailable = "No partner link yet" }: {
  href: string | null;
  children: ReactNode;
  variant?: "primary" | "dark" | "ghost";
  size?: "sm";
  brand?: string;
  offer?: string | null;
  from?: Placement;
  unavailable?: string;
}) {
  if (!href || !href.startsWith("/go/")) {
    return <span className={`cta-off${size ? " sm" : ""}`}>{unavailable}</span>;
  }
  return (
    <a
      className={`btn btn-${variant}${size ? ` btn-${size}` : ""}`}
      href={href}
      rel="sponsored nofollow noopener"
      target="_blank"
      data-track="affiliate_click"
      data-brand={brand}
      data-offer={offer ?? undefined}
      data-placement={from}
    >
      {children}
      <span className="sr-only"> (opens the brand&apos;s site in a new tab)</span>
    </a>
  );
}

export interface Crumb {
  name: string;
  path: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) =>
          i === items.length - 1 ? (
            <li key={c.path} aria-current="page">
              {c.name}
            </li>
          ) : (
            <li key={c.path}>
              <Link href={c.path}>{c.name}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

export function PageHead({ crumbs, title, lede, children }: { crumbs?: Crumb[]; title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      <h1 className="display" style={crumbs ? { marginTop: 20 } : undefined}>
        {title}
      </h1>
      {lede ? <p className="lede">{lede}</p> : null}
      {children}
    </header>
  );
}

export function EmptyState({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="state">
      <p className="display">{title}</p>
      <p>{children}</p>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

/** Previous / next links with the current page. `href(n)` builds the URL of page n. */
export function Pagination({ page, totalPages, href }: { page: number; totalPages: number; href: (n: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? (
        <Link className="btn btn-ghost btn-sm" href={href(page - 1)} rel="prev">
          Previous
        </Link>
      ) : null}
      <span className="current" aria-current="page">
        {page}
      </span>
      <span className="muted">of {totalPages}</span>
      {page < totalPages ? (
        <Link className="btn btn-ghost btn-sm" href={href(page + 1)} rel="next">
          Next
        </Link>
      ) : null}
    </nav>
  );
}

export function SectionHead({ title, intro, link, id }: { title: string; intro?: string; link?: { href: string; label: string }; id?: string }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="display" id={id}>
          {title}
        </h2>
        {intro ? <p>{intro}</p> : null}
      </div>
      {link ? (
        <Link href={link.href} className="text-link">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}
