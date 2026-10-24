import Link from "next/link";

const EXPLORE = [
  { href: "/deals/", label: "All deals" },
  { href: "/tools/", label: "AI tools" },
  { href: "/brands/", label: "Brands" },
  { href: "/categories/", label: "Categories" },
  { href: "/search/", label: "Search" },
];

const RESOURCES = [
  { href: "/blog/", label: "Blog" },
  { href: "/compare/", label: "Comparisons" },
  { href: "/alternatives/", label: "Alternatives" },
  { href: "/how-we-review/", label: "How we review" },
  { href: "/about/", label: "About us" },
  { href: "/contact/", label: "Contact us" },
];

const LEGAL = [
  { href: "/affiliate-disclosure/", label: "Affiliate disclosure" },
  { href: "/privacy-policy/", label: "Privacy policy" },
  { href: "/terms/", label: "Terms of use" },
  { href: "/disclaimer/", label: "Disclaimer" },
  { href: "/cookie-policy/", label: "Cookie policy" },
];

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <nav className="footer-col" aria-label={title}>
      <h2>{title}</h2>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer({ siteName, description, year }: { siteName: string; description: string; year: number }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="wordmark">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
              <img src="/brand/logo.webp" alt="" width={36} height={36} />
              <span>{siteName}</span>
            </Link>
            <p>{description}</p>
            <p>
              Independent and reader-supported. The brands we list do not own or endorse this site; some pay us a commission when you
              buy through our links. <Link href="/affiliate-disclosure/">How that works</Link>.
            </p>
          </div>
          <Column title="Explore" links={EXPLORE} />
          <Column title="Resources" links={RESOURCES} />
          <Column title="Legal" links={LEGAL} />
        </div>
        <div className="footer-bottom">
          <p>
            © {year} {siteName}
          </p>
          <ul>
            <li>
              <Link href="/privacy-policy/">Privacy</Link>
            </li>
            <li>
              <Link href="/terms/">Terms</Link>
            </li>
            <li>
              <Link href="/affiliate-disclosure/">Disclosure</Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
