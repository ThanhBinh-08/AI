import type { Metadata } from "next";
import Link from "next/link";
import { preload } from "react-dom";
import { BrandTile, DealList, DealTicket, PostTile, ToolTile } from "@/components/cards/cards";
import { HeroStats, type Stat } from "@/components/home/HeroStats";
import { HeroVideo } from "@/components/home/HeroVideo";
import { Header } from "@/components/layout/Header";
import { ChipRail } from "@/components/ui/ChipRail";
import { EmptyState, SectionHead } from "@/components/ui/bits";
import { SITE } from "@/config/site";
import { getHome } from "@/data/repository";
import { pageMeta } from "@/lib/seo";

// Built once, then refreshed in the background at most every 5 minutes (same window as the Sheet cache).
export const revalidate = 300;

export const metadata: Metadata = {
  ...pageMeta({
    title: `${SITE.name}: AI tools and software deals`,
    description: SITE.description,
    path: "/",
  }),
  // The home title is complete on its own; skip the "| Site" template.
  title: { absolute: `${SITE.name}: AI tools and software deals` },
};

export default async function HomePage() {
  // The poster is the first frame of the video: the largest thing painted above the fold.
  preload("/media/hero-poster.webp", { as: "image", fetchPriority: "high" });
  const home = await getHome();
  const stats: Stat[] = [
    { icon: "%", value: home.stats.deals, label: "Active deals" },
    // One tool per brand in the AI directory layout: showing both counts would repeat the same number.
    ...(home.stats.brands !== home.stats.tools ? [{ icon: "#", value: home.stats.brands, label: "Brands" }] : []),
    { icon: "*", value: home.stats.tools, label: "AI tools" },
    { icon: "<", value: home.stats.categories, label: "Categories" },
  ];
  const hasCatalog = stats.some((s) => s.value > 0);

  return (
    <main>
      <div className="hero-screen">
        <HeroVideo />
        <div className="page">
          <Header siteName={SITE.name} />

          <section className="hero" id="main" tabIndex={-1} aria-labelledby="hero-title">
            <Link href="/affiliate-disclosure/" className="trust-row anim" style={{ ["--d" as string]: "0.05s" }}>
              <span className="trust-avatars" aria-hidden="true">
                <span className="trust-avatar a1">
                  <span className="trust-avatar-inner">
                    <i className="trust-glyph">%</i>
                  </span>
                </span>
                <span className="trust-avatar a2">
                  <span className="trust-avatar-inner">
                    <i className="trust-glyph">*</i>
                  </span>
                </span>
                <span className="trust-avatar a3">
                  <span className="trust-avatar-inner">
                    <i className="trust-glyph">#</i>
                  </span>
                </span>
              </span>
              <span className="trust-pill">
                <span>Independent and reader-supported</span>
              </span>
            </Link>

            <h1 className="headline anim" id="hero-title">
              <span className="line">Discover AI Tools</span>
              <span className="line">&amp; Software Deals</span>
            </h1>

            <p className="subhead anim" style={{ ["--d" as string]: "0.28s" }}>
              Compare AI tools and find software discount codes.
              <br className="subhead-br" /> Every deal shows its source, its check status and its end date.
            </p>

            <div className="hero-actions">
              <form className="home-search anim" action="/search/" method="get" role="search" style={{ ["--d" as string]: "0.34s" }}>
                <label htmlFor="hero-q" className="sr-only">
                  Search tools, brands and deals
                </label>
                <input id="hero-q" name="q" type="search" placeholder="Search tools, brands or deals" maxLength={80} autoComplete="off" />
                <button type="submit">Search</button>
              </form>
              <div className="hero-ctas">
                <Link href="/deals/" className="cta-btn anim" style={{ ["--d" as string]: "0.4s" }}>
                  Browse deals
                </Link>
                <Link href="/tools/" className="cta-btn secondary anim" style={{ ["--d" as string]: "0.46s" }}>
                  Explore AI tools
                </Link>
              </div>
            </div>
          </section>

          {hasCatalog ? <HeroStats stats={stats} /> : <div aria-hidden="true" />}
        </div>
      </div>

      <div className="home-below">
        <div className="container">
          {hasCatalog ? null : (
            <section className="section">
              <EmptyState
                title="The first deals are on their way"
                actions={
                  <>
                    <Link className="btn btn-primary" href="/blog/">
                      Read the guides
                    </Link>
                    <Link className="btn btn-ghost" href="/how-we-review/">
                      How we check deals
                    </Link>
                  </>
                }
              >
                No tools or deals are published yet. We only list a deal once its code, discount and source have been recorded.
              </EmptyState>
            </section>
          )}

          {home.categories.length > 0 ? (
            <section className="section">
              <SectionHead title="Browse by category" link={{ href: "/categories/", label: "All categories" }} />
              <ChipRail
                label="AI tool categories"
                items={home.categories.map((c) => ({ href: `/categories/${c.slug}/`, label: c.name, count: c.tools }))}
              />
            </section>
          ) : null}

          {home.featuredDeals.length > 0 ? (
            <section className="section">
              <SectionHead title="Featured deals" intro="Picked by our editors, checked deals first." link={{ href: "/deals/", label: "All deals" }} />
              <ul className="ticket-band">
                {home.featuredDeals.map((d, i) => (
                  <DealTicket key={d.id} deal={d} variant={i === 0 ? "lead" : "side"} />
                ))}
              </ul>
            </section>
          ) : null}

          {home.deals.length > 0 ? (
            <section className="section">
              <SectionHead
                title="Latest deals"
                intro="Checked codes only, newest check on top. Each shows how it was checked and when it ends."
                link={{ href: "/deals/", label: "All deals" }}
              />
              <DealList deals={home.deals} />
            </section>
          ) : null}

          {/* In the AI directory layout every tool is its own brand: this list would repeat the deals above. */}
          {home.brands.length > 0 && home.stats.brands !== home.stats.tools ? (
            <section className="section">
              <SectionHead title="Brands with the most deals" link={{ href: "/brands/", label: "All brands" }} />
              <ul className="tiles">
                {home.brands.map((b) => (
                  <BrandTile key={b.id} brand={b} deals={b.activeDeals} tools={b.tools} />
                ))}
              </ul>
            </section>
          ) : null}

          {home.tools.length > 0 ? (
            <section className="section">
              <SectionHead title="AI tools in the directory" link={{ href: "/tools/", label: "All AI tools" }} />
              <ul className="tiles">
                {home.tools.map((t) => (
                  <ToolTile key={t.id} tool={t} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="section">
            <SectionHead title="Guides" intro="Practical notes on buying software and using discount codes." link={{ href: "/blog/", label: "All guides" }} />
            <ul className="tiles">
              {home.posts.map((p) => (
                <PostTile key={p.id} post={p} />
              ))}
            </ul>
          </section>

          <section className="section">
            <SectionHead title="How this site works" link={{ href: "/how-we-review/", label: "Our checking process" }} />
            <ol className="steps">
              <li>
                <h3>Find a tool or a deal</h3>
                <p>Search, or browse by category. Tool pages list features and prices only with the date they were checked.</p>
              </li>
              <li>
                <h3>Read the status and conditions</h3>
                <p>Each code is marked not yet checked, source checked or tested at checkout, with its end date and conditions.</p>
              </li>
              <li>
                <h3>Open the offer</h3>
                <p>Copy the code and continue to the brand&apos;s site. The price you pay is set by the brand, not by us.</p>
              </li>
            </ol>
          </section>

          <section className="section">
            <p className="notice">
              We may earn a commission when you buy through links on this site, at no extra cost to you. Commissions never change a
              deal&apos;s check status. Read the <Link href="/affiliate-disclosure/">affiliate disclosure</Link>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
