import Link from "next/link";
import { endsLabel, splitDiscount } from "@/components/cards/cards";
import { RevealCode } from "@/components/deals/RevealCode";
import type { CSSProperties } from "react";
import { BrandLogo, GoLink, VerificationStatus } from "@/components/ui/bits";
import { TONES, toneOfCategory } from "@/lib/tone";
import type { DealView } from "@/types/catalog";

/** Glow colours of a card follow the tool's first category, like the Blog covers of the same tool. */
function panelVars(deal: DealView): CSSProperties {
  const t = TONES[toneOfCategory(deal.brand.categories[0] ?? "")] ?? TONES[3];
  return { "--tone-a": t.a, "--tone-b": t.b } as CSSProperties;
}

/**
 * The three featured deals shown on every page: one lead card on the left half, two cards stacked on the right half
 * (each half the lead's height). One column on phones.
 *
 * It renders only what it is given: the caller passes deals chosen by `selectFeatured` (explicitly featured, live,
 * checked, with a working /go/ link). With no deals it renders nothing; it never fills a slot on its own.
 *
 * `editorial` (the Blog): no code, no copy control and no outbound button; each card links to the deal's own page.
 */
export function FeaturedDeals({ deals, id, title = "Featured deals", intro, showAllLink = true, editorial = false, className }: {
  deals: DealView[];
  /** Id of the heading (unique on the page). */
  id: string;
  title?: string;
  intro?: string;
  /** Link to the Deals page, the place to browse every offer. Off on the Deals page itself. */
  showAllLink?: boolean;
  editorial?: boolean;
  /** Layout class from the page (e.g. "section"), so an empty placement leaves no empty box behind. */
  className?: string;
}) {
  const shown = deals.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <section className={`fd${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <div className="fd-head">
        <div>
          <h2 className="fd-title" id={id}>
            {title}
          </h2>
          {intro ? <p className="fd-intro">{intro}</p> : null}
        </div>
        {showAllLink ? (
          <Link className="text-link" href="/deals/">
            All deals
          </Link>
        ) : null}
      </div>
      <ul className="fd-grid" data-count={shown.length}>
        {shown.map((d, i) => (
          <FeaturedCard key={d.id} deal={d} lead={i === 0} editorial={editorial} />
        ))}
      </ul>
      {editorial ? null : (
        <p className="fd-disclosure">
          We may earn a commission when you buy through these links, at no extra cost to you. It never changes which deals
          are featured or how they were checked. <Link href="/affiliate-disclosure/">Affiliate disclosure</Link>
        </p>
      )}
    </section>
  );
}

function FeaturedCard({ deal, lead, editorial }: { deal: DealView; lead: boolean; editorial: boolean }) {
  const [big, rest] = splitDiscount(deal.discount);
  const ends = endsLabel(deal.expiresAt);
  const name = deal.brand.name;
  // Articles never carry a code: it is dropped here, before anything is rendered.
  const code = editorial ? null : deal.code;
  return (
    <li
      className={`fd-card${lead ? " is-lead" : ""}`}
      style={panelVars(deal)}
      {...(editorial ? {} : { "data-impression": "", "data-brand": deal.brand.id, "data-offer": deal.id, "data-placement": "featured" })}
    >
      {/* The LED dot panel of the Blog covers, lit from behind the brand's logo (from the deal's tool_id). */}
      <span className="fd-glow" aria-hidden="true" />
      <span className="fd-logo" aria-hidden="true">
        <BrandLogo name={name} src={deal.brand.logoUrl} size={lead ? "lg" : "md"} />
      </span>
      <div className="fd-body">
        <Link className="fd-brand" href={`/brands/${deal.brand.slug}/`}>
          {name}
        </Link>
        <p className="fd-figure">
          <span className="fd-big">{big}</span>
          {rest ? <span className="fd-rest">{rest}</span> : null}
        </p>
        <h3 className="fd-name">
          <Link href={`/deals/${deal.slug}/`}>{deal.title}</Link>
        </h3>
        {deal.terms ? (
          <p className="fd-terms">
            <span className="sr-only">Conditions: </span>
            {deal.terms}
          </p>
        ) : null}
        <div className="fd-meta">
          <VerificationStatus value={deal.verification} at={deal.verifiedAt} />
          <span className={ends.urgent ? "urgent" : undefined}>{ends.text}</span>
        </div>
      </div>
      <div className="fd-actions">
        {editorial ? (
          <Link className="btn btn-ghost btn-sm" href={`/deals/${deal.slug}/`}>
            View deal<span className="sr-only">: {deal.title}</span>
          </Link>
        ) : (
          <>
            {code ? (
              <RevealCode code={code} label={`${name} ${deal.discount}`} brand={deal.brand.id} offer={deal.id} placement="featured" />
            ) : (
              // No code: an empty slot, so Get Deal keeps its place.
              <span className="fd-nocode" aria-hidden="true" />
            )}
            <GoLink brandId={deal.brand.id} enabled={deal.brand.hasAffiliate} offer={deal.id} from="featured" size={lead ? undefined : "sm"}>
              Get Deal<span className="sr-only">: {deal.title}</span>
            </GoLink>
          </>
        )}
      </div>
    </li>
  );
}
