import type { Metadata } from "next";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealList } from "@/components/cards/cards";
import { DealCodeBox, DealRevealProvider } from "@/components/deals/DealCodeBox";
import { BrandLogo, Breadcrumbs, GoLink, JsonLd, VerificationStatus } from "@/components/ui/bits";
import { getDeal, isPromotable, listFeaturedDeals } from "@/data/repository";
import { formatDay } from "@/lib/dates";
import { getSiteUrl } from "@/lib/env";
import { goHref } from "@/lib/go";
import { breadcrumbs } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

// Pages are built on first request and cached; nothing is fetched at build time.
export async function generateStaticParams() {
  return [];
}


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getDeal((await params).slug);
  if (!data) notFound();
  const { deal } = data;
  return pageMeta({
    title: `${deal.title}${deal.active ? "" : " (expired)"}`,
    description: deal.active
      ? `${deal.discount} at ${deal.brand.name}. ${deal.code ? "Code, " : ""}conditions, check status${deal.expiresAt ? " and end date" : ""}.`
      : `This ${deal.brand.name} deal has ended. See the brand's current deals.`,
    path: `/deals/${deal.slug}/`,
    // Expired and not-yet-checked deals keep their page for visitors with links, but stay out of the index.
    noindex: !isPromotable(deal),
    image: deal.brand.logoUrl,
  });
}

export default async function DealPage({ params }: Props) {
  const data = await getDeal((await params).slug);
  if (!data) notFound();
  const { deal, related } = data;
  const featured = await listFeaturedDeals({ categories: deal.brand.categories, exclude: [deal.id, ...related.map((d) => d.id)] });
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals/" },
    { name: deal.brand.name, path: `/brands/${deal.brand.slug}/` },
    { name: deal.title, path: `/deals/${deal.slug}/` },
  ];

  return (
    <div className="container">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />
      <header className="page-head">
        <Breadcrumbs items={crumbs} />
        <div className="deal-hero" style={{ marginTop: 28 }}>
          <BrandLogo name={deal.brand.name} src={deal.brand.logoUrl} size="lg" />
          <p className="deal-discount">{deal.discount}</p>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(28px, 4vw, 48px)", marginTop: 20, maxWidth: "24ch" }}>
          {deal.title}
        </h1>
        <div className="meta-line">
          <VerificationStatus value={deal.verification} at={deal.verifiedAt} expired={!deal.active} />
          {deal.expiresAt ? <span>{deal.active ? "Ends" : "Ended"} {formatDay(deal.expiresAt)}</span> : <span>No end date published</span>}
        </div>
      </header>

      <div className="detail deal-detail">
        <div>
          {deal.active && !isPromotable(deal) ? (
            <p className="notice" style={{ marginBottom: 28 }}>
              Not yet checked: we have not confirmed that this code works or where it comes from, so it is not listed with our
              deals. Check the total at checkout before you pay.
            </p>
          ) : null}
          {!deal.active ? (
            <p className="notice" style={{ marginBottom: 28 }}>
              This deal has ended{deal.expiresAt ? ` (${formatDay(deal.expiresAt)})` : ""}, so its code is no longer shown. It stays here for
              reference.{" "}
              <Link href={`/brands/${deal.brand.slug}/`}>See current {deal.brand.name} deals</Link>.
            </p>
          ) : null}

          <section aria-labelledby="deal-details">
            <h2 id="deal-details" className="subhead-s">
              Deal details
            </h2>
            <dl className="facts">
              <dt>Brand</dt>
              <dd>
                <Link href={`/brands/${deal.brand.slug}/`}>{deal.brand.name}</Link>
              </dd>
              <dt>Discount</dt>
              <dd>{deal.discount}</dd>
              <dt>Code</dt>
              <dd>{deal.code ? (deal.active ? "Shown after Reveal Code or Get Deal" : "Hidden, deal ended") : "No code for this deal"}</dd>
              <dt>Status</dt>
              <dd>
                <VerificationStatus value={deal.verification} at={deal.verifiedAt} expired={!deal.active} />
              </dd>
              <dt>End date</dt>
              <dd>{deal.expiresAt ? formatDay(deal.expiresAt) : "Not published by the brand"}</dd>
              {deal.sourceHost ? (
                <>
                  <dt>Source</dt>
                  <dd>{deal.sourceHost}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section style={{ marginTop: 36 }} aria-labelledby="deal-terms">
            <h2 id="deal-terms" className="subhead-s">
              Conditions
            </h2>
            <p className="prose">{deal.terms || "No conditions were published with this deal. Check the plan terms on the brand's checkout page before you pay."}</p>
          </section>

          {deal.active ? (
            <section style={{ marginTop: 36 }} aria-labelledby="deal-use">
              <h2 id="deal-use" className="subhead-s">
                Using this deal
              </h2>
              <ol className="prose" style={{ paddingLeft: "1.3em" }}>
                {deal.code ? <li>Press Reveal Code or Get Deal on this page, then copy the code.</li> : null}
                <li>Open {deal.brand.name}&apos;s site with the button on this page and choose the plan the deal applies to.</li>
                {deal.code ? <li>Enter the code in the discount field at checkout.</li> : null}
                <li>Check that the order total changed before you enter payment details.</li>
              </ol>
              <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
                More in <Link href="/blog/how-to-check-a-software-coupon-code/">how to check a software coupon code</Link>.
              </p>
            </section>
          ) : null}

          {deal.brand.description ? (
            <section style={{ marginTop: 36 }} aria-labelledby="deal-brand">
              <h2 id="deal-brand" className="subhead-s">
                About {deal.brand.name}
              </h2>
              <p className="prose">{deal.brand.description}</p>
            </section>
          ) : null}
        </div>

        <aside className="aside" aria-label="Get this deal">
          <div
            className="panel offer-panel"
            {...(isPromotable(deal) ? { "data-impression": "", "data-brand": deal.brand.id, "data-offer": deal.id, "data-placement": "deal-page" } : {})}
          >
            {deal.active ? (
              <DealRevealProvider slug={deal.slug}>
                <p className="offer-figure">{deal.discount}</p>
                {deal.code ? (
                  isPromotable(deal) ? (
                    <DealCodeBox slug={deal.slug} href={deal.brand.hasAffiliate ? goHref(deal.brand.id, { offer: deal.id, from: "deal-page" }) : null} brand={deal.brand.id} offer={deal.id} />
                  ) : (
                    <p className="muted">The code is shown once this deal has been checked.</p>
                  )
                ) : (
                  <p className="muted">No code needed: the discount applies on {deal.brand.name}&apos;s site.</p>
                )}
                {deal.brand.hasAffiliate ? (
                  <GoLink brandId={deal.brand.id} enabled offer={deal.id} from="deal-page" variant={isPromotable(deal) ? "dark" : "ghost"} slug={isPromotable(deal) ? deal.slug : undefined} openOnArrival>
                    {isPromotable(deal) ? "Get Deal" : `Visit ${deal.brand.name}`}
                  </GoLink>
                ) : (
                  <GoLink brandId={deal.brand.id} enabled={false}>
                    Get Deal
                  </GoLink>
                )}
                <p className="offer-terms">
                  <strong>Conditions:</strong> {deal.terms || "none published. Check the plan terms at checkout."}
                  {deal.expiresAt ? ` Ends ${formatDay(deal.expiresAt)}.` : " No end date published."}
                </p>
              </DealRevealProvider>
            ) : (
              <Link className="btn btn-primary" href={`/brands/${deal.brand.slug}/`}>
                Current {deal.brand.name} deals
              </Link>
            )}
            {deal.brand.hasAffiliate ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Affiliate link: we may earn a commission if you buy. <Link href="/affiliate-disclosure/">Disclosure</Link>
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="section" style={{ marginTop: 40 }}>
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            Related deals
          </h2>
          <DealList deals={related} />
        </section>
      ) : null}
      <FeaturedDeals className="section" deals={featured} id="page-featured" />
    </div>
  );
}
