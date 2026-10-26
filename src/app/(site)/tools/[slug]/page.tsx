import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DealList, endsLabel, splitDiscount, ToolCard } from "@/components/cards/cards";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import { CopyCode } from "@/components/ui/CopyCode";
import { BrandLogo, Breadcrumbs, GoLink, JsonLd } from "@/components/ui/bits";
import { categoryBySlug } from "@/config/categories";
import { SITE_LOGO } from "@/config/site";
import { getTool, isIndexableTool, listFeaturedDeals, reviewSlugForTool, toolLogo } from "@/data/repository";
import { formatDay } from "@/lib/dates";
import { goHref } from "@/lib/go";
import { getSiteUrl } from "@/lib/env";
import { breadcrumbs } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";
import { coverVars, toneOfCategory } from "@/lib/tone";
import type { Brand, DealView, Product } from "@/types/catalog";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };
type Tool = Product & { brand: Brand };

export async function generateStaticParams() {
  return [];
}

/** Title from what the page really has: never promises pricing or deals that are not on it. */
function titleFor(tool: Product, hasDeals: boolean): string {
  const parts = [hasDeals ? "verified deals" : null, tool.features.length > 0 ? "features" : null, tool.pricing ? "pricing" : null].filter(Boolean);
  return parts.length > 0 ? `${tool.name}: ${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}` : `${tool.name}: AI tool overview`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getTool((await params).slug);
  if (!data) return { title: "Tool not found", robots: { index: false } };
  const { tool, deals } = data;
  const category = tool.categories[0] ? categoryBySlug(tool.categories[0])?.name : null;
  return pageMeta({
    title: titleFor(tool, deals.length > 0),
    description: tool.description || `${tool.name}${category ? `, an ${category} tool` : ""}: what it does and where to find it.`,
    path: `/tools/${tool.slug}/`,
    noindex: !isIndexableTool(tool),
    image: toolLogo(tool),
  });
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/**
 * The tool's own website, as a text link. It goes through /go/<tool_id>/, which redirects to the URL in that tool's
 * Tools row (affiliate_url, or official_url). Without a usable link the host is shown as plain text.
 */
function ToolSiteLink({ tool }: { tool: Tool }) {
  const host = tool.officialUrl ? hostOf(tool.officialUrl) : tool.name;
  if (!tool.brand.hasAffiliate) return <>{host}</>;
  return (
    <a
      className="text-link"
      href={goHref(tool.brand.id, { from: "tool-site" })}
      rel="sponsored nofollow noopener"
      target="_blank"
      data-track="affiliate_click"
      data-brand={tool.brand.id}
      data-placement="tool-site"
    >
      {host}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Plain reference link to a listing source (not the tool's site). Not an affiliate link and not styled as a CTA. */
function OfficialLink({ url, children }: { url: string; children?: ReactNode }) {
  return (
    <a className="text-link" href={url} rel="nofollow noopener noreferrer" target="_blank">
      {children ?? hostOf(url)}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The record's state in words and a mark: checked (with date), not yet checked, or fictional sample. */
function StatusMark({ tool }: { tool: Tool }) {
  if (tool.brand.sample) return <span className="tp-status is-sample">Fictional sample</span>;
  if (tool.verified) return <span className="tp-status is-checked">Checked{tool.verifiedAt ? ` ${formatDay(tool.verifiedAt)}` : ""}</span>;
  return <span className="tp-status is-unchecked">Not yet checked</span>;
}

/** One row of the spec sheet: heading on the left, content on the right, hairline between rows. */
function Row({ id, title, note, wide, children }: { id: string; title: string; note?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`tp-row${wide ? " is-wide" : ""}`} aria-labelledby={id}>
      <div className="tp-row-head">
        <h2 id={id}>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      <div className="tp-row-body">{children}</div>
    </section>
  );
}

/** The best checked deal, shown in the light plate: the number in the dot face, its conditions, code and CTA. */
function PlateDeal({ deal }: { deal: DealView }) {
  const [big, rest] = splitDiscount(deal.discount);
  const ends = endsLabel(deal.expiresAt);
  return (
    <div className="tp-deal" data-impression data-brand={deal.brand.id} data-offer={deal.id} data-placement="tool-offer">
      <p className="tp-deal-figure">
        <span className="tp-deal-big">{big}</span>
        {rest ? <span className="tp-deal-rest">{rest}</span> : null}
      </p>
      <p className="tp-deal-title">
        <Link href={`/deals/${deal.slug}/`}>{deal.title}</Link>
      </p>
      <ul className="tp-deal-terms">
        <li>
          {deal.verification === "checkout_tested" ? "Tested at checkout" : "Source checked"}
          {deal.verifiedAt ? ` ${formatDay(deal.verifiedAt)}` : ""}
        </li>
        <li className={ends.urgent ? "urgent" : undefined}>{ends.text}</li>
        {deal.terms ? <li>{deal.terms}</li> : null}
      </ul>
      {deal.code ? <CopyCode code={deal.code} brand={deal.brand.id} offer={deal.id} placement="tool-offer" /> : null}
    </div>
  );
}

/** The lit plate beside the title: logo on the LED dot panel, then the offer and the one outbound action. */
function LightPlate({ tool, deal }: { tool: Tool; deal: DealView | undefined }) {
  const logo = toolLogo(tool);
  const affiliate = tool.brand.hasAffiliate;
  return (
    <aside className="tp-plate" aria-label={`${tool.name} offer and link`} style={coverVars(tool.slug, toneOfCategory(tool.categories[0] ?? ""))}>
      <div className="tp-panel" aria-hidden="true">
        <span className="cover-glow" />
        {/* No logo for this tool: the site's own logo lights the plate instead of initials. */}
        <BrandLogo name={tool.name} src={logo ?? SITE_LOGO} size="xl" />
      </div>
      <div className="tp-offer">
        {deal ? (
          <PlateDeal deal={deal} />
        ) : (
          <div className="tp-nodeal">
            <h2>No verified deal available</h2>
            <p>We list a coupon only after checking where it comes from.</p>
          </div>
        )}
        {affiliate ? (
          <>
            {/* One primary action: the deal when there is one, otherwise a plain visit that promises no discount. */}
            {/* Only Featured deals carry a white Get Deal; everywhere else it is the dark button. */}
            <GoLink brandId={tool.brand.id} enabled offer={deal?.id} from="tool-offer" variant={deal ? "dark" : "primary"}>
              {deal ? "Get Deal" : `Visit ${tool.name}`}
            </GoLink>
            <p className="tp-fine">
              {deal ? null : "No discount applies to this link. "}Affiliate link: we may earn a commission at no extra cost to you.{" "}
              <Link href="/affiliate-disclosure/">Disclosure</Link>
            </p>
          </>
        ) : (
          <p className="tp-fine tp-nolink">
            {tool.brand.sample ? "Sample entries have no outbound link." : `We don't have an approved partner link for ${tool.name} yet, so there is no button here.`}
          </p>
        )}
      </div>
    </aside>
  );
}

export default async function ToolPage({ params }: Props) {
  const data = await getTool((await params).slug);
  if (!data) notFound();
  const { tool, deals, related, relatedDeals, comparisons, alternatives } = data;
  const [profileSlug, featured] = await Promise.all([
    reviewSlugForTool(tool.id),
    // Featured deals of the same categories that this page does not already show.
    listFeaturedDeals({ categories: tool.categories, exclude: [...deals, ...relatedDeals].map((d) => d.id) }),
  ]);
  const primary = tool.categories[0] ? categoryBySlug(tool.categories[0]) : undefined;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "AI Tools", path: "/tools/" },
    ...(primary ? [{ name: primary.name, path: `/categories/${primary.slug}/` }] : []),
    { name: tool.name, path: `/tools/${tool.slug}/` },
  ];
  const hasEditorial = tool.features.length + tool.useCases.length + tool.platforms.length + tool.pros.length + tool.cons.length > 0;
  const commercial = tool.brand.hasAffiliate || deals.length > 0 || relatedDeals.some((d) => d.brand.hasAffiliate);
  const source = tool.listingSource;

  return (
    <div className="container tool-page">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />

      <Breadcrumbs items={crumbs} />

      {/* Hero: who the tool is (left), the lit plate with the offer and the CTA (right). */}
      <div className="tp-hero">
        <header className="tp-intro">
          <div className="tp-tags">
            <StatusMark tool={tool} />
            {tool.categories.length > 0 ? (
              <ul className="tp-cats" aria-label="Categories">
                {tool.categories.map((c) => (
                  <li key={c}>
                    <Link className="chip" href={`/categories/${c}/`}>
                      {categoryBySlug(c)?.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <h1 className={`tp-title${tool.name.length > 16 ? " is-long" : ""}`}>{tool.name}</h1>
          {tool.brand.name !== tool.name ? (
            <p className="tp-maker">
              by <Link href={`/brands/${tool.brand.slug}/`}>{tool.brand.name}</Link>
            </p>
          ) : null}
          {tool.description ? <p className="tp-lede">{tool.description}</p> : null}
          {tool.brand.sample ? (
            <p className="tp-provenance">A fictional entry used to test this layout. It is not a real product and appears on preview sites only.</p>
          ) : !tool.verified && source ? (
            <p className="tp-provenance">
              Summary from the {source.name} listing.{tool.brand.preview ? " Preview record, shown on preview sites only." : ""}
            </p>
          ) : null}
        </header>

        <LightPlate tool={tool} deal={deals[0]} />
      </div>

      {/* Spec sheet: one row per kind of fact, shown only when there is data behind it. */}
      <div className="tp-sheet">
        {/* A checked tool's summary is already in the hero; the overview row is for what is still missing. */}
        {!tool.verified ? (
          <Row id="tp-overview" title="Overview">
            <div className="tp-pending">
              <p className="tp-text">
                Features, platforms, strengths and limitations appear here once we have checked {tool.name} on its official site
                {tool.officialUrl || tool.brand.hasAffiliate ? (
                  <>
                    {" "}
                    (<ToolSiteLink tool={tool} />)
                  </>
                ) : null}
                .
              </p>
              {profileSlug ? (
                <Link className="text-link" href={`/blog/${profileSlug}/`}>
                  Read the {tool.name} profile on the blog
                </Link>
              ) : null}
            </div>
          </Row>
        ) : null}

        {tool.features.length > 0 ? (
          <Row id="tp-features" title="Key features">
            <ul className="tp-features">
              {tool.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Row>
        ) : null}

        {tool.useCases.length > 0 ? (
          <Row id="tp-uses" title="Best use cases">
            <ul className="tp-pills">
              {tool.useCases.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </Row>
        ) : null}

        <Row id="tp-pricing" title="Pricing">
          <div className={`tp-price${tool.pricing ? " is-checked" : ""}`}>
            {tool.pricing ? (
              <>
                <p className="tp-price-value">{tool.pricing}</p>
                <p className="tp-price-note">
                  Checked {formatDay(tool.pricingCheckedAt!)}
                  {tool.pricingSourceHost ? ` on ${tool.pricingSourceHost}` : ""}. Prices change, so confirm at checkout.
                </p>
              </>
            ) : (
              <>
                <p className="tp-price-value">Pricing not verified</p>
                <p className="tp-price-note">We show a price only with the date we checked it. Confirm the current price at checkout.</p>
              </>
            )}
          </div>
        </Row>

        {tool.platforms.length > 0 ? (
          <Row id="tp-platforms" title="Supported platforms">
            <ul className="tp-pills">
              {tool.platforms.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Row>
        ) : null}

        {tool.pros.length + tool.cons.length > 0 ? (
          <Row id="tp-tradeoffs" title="Strengths and limitations">
            <div className="tp-tradeoffs">
              {tool.pros.length > 0 ? (
                <ul aria-label="Strengths" className="tp-pros">
                  {tool.pros.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : null}
              {tool.cons.length > 0 ? (
                <ul aria-label="Limitations" className="tp-cons">
                  {tool.cons.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Row>
        ) : null}

        {deals.length > 1 ? (
          <Row id="tp-deals" title="All verified deals" wide>
            <DealList deals={deals} />
          </Row>
        ) : null}

        {hasEditorial && profileSlug ? (
          <Row id="tp-read" title="Further reading">
            <Link className="text-link" href={`/blog/${profileSlug}/`}>
              Read about {tool.name} on the blog
            </Link>
          </Row>
        ) : null}
      </div>

      {related.length > 0 ? (
        <section className="tp-similar" aria-labelledby="tp-similar">
          <h2 id="tp-similar">Similar tools{primary ? ` in ${primary.name}` : ""}</h2>
          <ul className="tp-cards">
            {related.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </ul>
          {relatedDeals.length > 0 ? (
            <div className="tp-related-deals">
              <h3>Verified deals on similar tools</h3>
              <DealList deals={relatedDeals} />
            </div>
          ) : null}
          {comparisons.length > 0 || alternatives ? (
            <ul className="chips tp-compare" aria-label="Comparisons">
              {comparisons.map((p) => (
                <li key={p.id}>
                  <Link className="chip" href={`/compare/${p.slug}/`}>
                    {p.title}
                  </Link>
                </li>
              ))}
              {alternatives ? (
                <li>
                  <Link className="chip" href={`/alternatives/${alternatives.slug}/`}>
                    {alternatives.title}
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>
      ) : null}

      <FeaturedDeals
        className="tp-featured"
        deals={featured}
        id="tp-featured"
       
      />

      <section className="tp-sources" aria-labelledby="tp-sources">
        <h2 id="tp-sources">Sources and last check</h2>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{tool.verified ? `Checked by us${tool.verifiedAt ? ` on ${formatDay(tool.verifiedAt)}` : ""}` : tool.brand.sample ? "Fictional sample" : "Not yet checked by us"}</dd>
          </div>
          {source ? (
            <div>
              <dt>Listing data</dt>
              <dd>{source.url ? <OfficialLink url={source.url}>{source.name}</OfficialLink> : source.name}</dd>
            </div>
          ) : null}
          {tool.officialUrl || tool.brand.hasAffiliate ? (
            <div>
              <dt>Official site</dt>
              <dd>
                <ToolSiteLink tool={tool} />
              </dd>
            </div>
          ) : null}
          {tool.brand.updatedAt ? (
            <div>
              <dt>Record updated</dt>
              <dd>
                <time dateTime={tool.brand.updatedAt}>{formatDay(tool.brand.updatedAt)}</time>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="tp-sources-links">
          {commercial ? <Link href="/affiliate-disclosure/">How we earn money</Link> : null}
          <Link href="/how-we-review/">How we check tools and deals</Link>
          <Link href="/contact/">Report a mistake</Link>
        </p>
      </section>
    </div>
  );
}
