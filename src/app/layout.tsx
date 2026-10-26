import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "@/styles/hero.css";
import "@/styles/site.css";
import "@/styles/deals.css";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/ui/bits";
import { SITE } from "@/config/site";
import { getSiteUrl, isIndexable } from "@/lib/env";
import { organization, website } from "@/lib/jsonld";
import { Analytics } from "@/components/layout/Analytics";

// Self-hosted at build time by next/font (no request to Google from the visitor's browser).
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: `${SITE.name}: AI tools and software deals`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
  icons: { icon: "/brand/logo.webp", apple: "/brand/logo.webp" },
  openGraph: { siteName: SITE.name, locale: SITE.locale, type: "website", images: [{ url: "/media/og-default.jpg", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const site = getSiteUrl();
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <Footer siteName={SITE.name} description={SITE.description} year={new Date().getFullYear()} />
        <JsonLd data={organization(site)} />
        <JsonLd data={website(site)} />
        <Analytics />
      </body>
    </html>
  );
}
