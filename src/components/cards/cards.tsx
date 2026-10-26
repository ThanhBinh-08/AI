import Link from "next/link";
import { categoryBySlug } from "@/config/categories";
import { daysUntil, formatDay } from "@/lib/dates";
import type { Brand, DealView, Post, Product } from "@/types/catalog";
import { CopyCode } from "@/components/ui/CopyCode";
import { BrandLogo, GoLink, VerificationStatus } from "@/components/ui/bits";
import type { Placement } from "@/lib/go";

/** "30% off" → ["30%", "off"]; "2 months free" → ["2", "months free"]. The first token is the number shown big. */
export function splitDiscount(discount: string): [string, string] {
  const m = discount.trim().match(/^(\S+)\s+(.+)$/);
  return m ? [m[1]!, m[2]!] : [discount.trim(), ""];
}

/** "Ends in 3 days" close to the end date, the date itself otherwise. */
export function endsLabel(day: string | null): { text: string; urgent: boolean } {
  if (!day) return { text: "No end date published", urgent: false };
  const n = daysUntil(day);
  if (n <= 0) return { text: "Ends today", urgent: true };
  if (n === 1) return { text: "Ends tomorrow", urgent: true };
  if (n <= 14) return { text: `Ends in ${n} days`, urgent: n <= 7 };
  return { text: `Ends ${formatDay(day)}`, urgent: false };
}

/**
 * The one primary action of a deal: "Get Deal" through the brand's approved affiliate link when the deal is live and
 * checked; otherwise the deal's own page (or the brand's deals once it has ended). Never a substitute outbound URL.
 */
function DealCta({ deal, size, variant, from }: { deal: DealView; size?: "sm"; variant: "primary" | "dark"; from: Placement }) {
  if (deal.active && deal.verification !== "unverified" && deal.brand.hasAffiliate) {
    return (
      <GoLink brandId={deal.brand.id} enabled size={size} variant={variant} offer={deal.id} from={from}>
        Get Deal
      </GoLink>
    );
  }
  return (
    <Link className={`btn btn-ghost${size ? ` btn-${size}` : ""}`} href={deal.active ? `/deals/${deal.slug}/` : `/brands/${deal.brand.slug}/`}>
      {deal.active ? "View deal" : `See current ${deal.brand.name} deals`}
    </Link>
  );
}

/** One deal as a row: logo, discount in the dot-matrix face, title and conditions, code and CTA. */
export function DealRow({ deal, headingLevel = 3 }: { deal: DealView; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <li className="deal-row" {...(deal.active ? { "data-impression": "", "data-brand": deal.brand.id, "data-offer": deal.id, "data-placement": "deal-row" } : {})}>
      <BrandLogo name={deal.brand.name} src={deal.brand.logoUrl} />
      <p className="deal-discount">
        <span className="deal-big">{splitDiscount(deal.discount)[0]}</span>
        {splitDiscount(deal.discount)[1] ? <span className="deal-rest">{splitDiscount(deal.discount)[1]}</span> : null}
      </p>
      <div className="deal-body">
        <Link className="deal-brand" href={`/brands/${deal.brand.slug}/`}>
          {deal.brand.name}
        </Link>
        <H>
          <Link href={`/deals/${deal.slug}/`}>{deal.title}</Link>
        </H>
        <div className="deal-meta">
          <VerificationStatus value={deal.verification} at={deal.verifiedAt} expired={!deal.active} />
          <span className={endsLabel(deal.expiresAt).urgent ? "urgent" : undefined}>{endsLabel(deal.expiresAt).text}</span>
          {deal.terms ? <span>Conditions apply</span> : null}
        </div>
      </div>
      <div className="deal-actions">
        {deal.active && deal.code ? <CopyCode code={deal.code} brand={deal.brand.id} offer={deal.id} placement="deal-row" /> : null}
        <DealCta deal={deal} size="sm" variant="dark" from="deal-row" />
      </div>
    </li>
  );
}

/**
 * Deals named inside editorial pages (the Blog): discount, title and status, linking to the deal's own page.
 * No code, no copy control and no outbound button, so articles stay articles.
 */
export function DealMentions({ deals }: { deals: DealView[] }) {
  return (
    <ul className="deal-mentions">
      {deals.map((d) => {
        const [big, rest] = splitDiscount(d.discount);
        return (
          <li key={d.id}>
            <BrandLogo name={d.brand.name} src={d.brand.logoUrl} size="sm" />
            <p className="deal-mention-figure">
              <span>{big}</span> {rest}
            </p>
            <div>
              <Link href={`/deals/${d.slug}/`}>{d.title}</Link>
              <VerificationStatus value={d.verification} at={d.verifiedAt} expired={!d.active} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DealList({ deals }: { deals: DealView[] }) {
  return (
    <ul className="deal-list">
      {deals.map((d) => (
        <DealRow key={d.id} deal={d} />
      ))}
    </ul>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function ToolTile({ tool }: { tool: Product & { brand: Brand; activeDeals: number } }) {
  return (
    <li>
      <article className="tile">
        <div className="tile-top">
          <BrandLogo name={tool.name} src={tool.imageUrl ?? tool.brand.logoUrl} size="sm" />
          <div>
            <h3>
              <Link href={`/tools/${tool.slug}/`}>{tool.name}</Link>
            </h3>
            {tool.brand.name !== tool.name ? (
              <span className="muted" style={{ fontSize: 13 }}>
                by {tool.brand.name}
              </span>
            ) : null}
          </div>
        </div>
        {tool.description ? <p>{tool.description}</p> : null}
        <div className="tile-foot">
          {tool.categories.slice(0, 2).map((c) => (
            <span key={c}>{categoryBySlug(c)?.name}</span>
          ))}
          {tool.activeDeals > 0 ? <span className="has-deal">{plural(tool.activeDeals, "active deal")}</span> : null}
        </div>
      </article>
    </li>
  );
}

/**
 * A similar tool on a tool page: fixed logo, name, two-line summary and its categories, the whole card one link.
 * The logo is the tool's own (Tools.logo_url by tool_id); without one, its initials.
 */
export function ToolCard({ tool }: { tool: Product & { brand: Brand; activeDeals: number } }) {
  return (
    <li>
      <article className="tool-card">
        <BrandLogo name={tool.name} src={tool.imageUrl ?? tool.brand.logoUrl} size="md" />
        <div className="tool-card-body">
          <h3>
            <Link href={`/tools/${tool.slug}/`}>{tool.name}</Link>
          </h3>
          {tool.description ? <p>{tool.description}</p> : null}
        </div>
        <div className="tool-card-foot">
          {tool.categories.slice(0, 2).map((c) => (
            <span key={c}>{categoryBySlug(c)?.name}</span>
          ))}
          {tool.activeDeals > 0 ? <span className="has-deal">{plural(tool.activeDeals, "active deal")}</span> : null}
        </div>
      </article>
    </li>
  );
}

export function BrandTile({ brand, deals, tools }: { brand: Brand; deals: number; tools: number }) {
  return (
    <li>
      <article className="tile">
        <div className="tile-top">
          <BrandLogo name={brand.name} src={brand.logoUrl} />
          <h3>
            <Link href={`/brands/${brand.slug}/`}>{brand.name}</Link>
          </h3>
        </div>
        {brand.description ? <p>{brand.description}</p> : null}
        <div className="tile-foot">
          <span>{plural(deals, "active deal")}</span>
          {tools > 0 ? <span>{plural(tools, "tool")}</span> : null}
        </div>
      </article>
    </li>
  );
}

export function CategoryTile({ slug, name, glyph, deals, tools }: { slug: string; name: string; glyph: string; deals: number; tools: number }) {
  return (
    <li>
      <article className="tile">
        <span className="cat-glyph" aria-hidden="true">
          {glyph}
        </span>
        <h3>
          <Link href={`/categories/${slug}/`}>{name}</Link>
        </h3>
        <div className="tile-foot">
          {deals > 0 ? <span>{plural(deals, "deal")}</span> : null}
          {tools > 0 ? <span>{plural(tools, "tool")}</span> : null}
        </div>
      </article>
    </li>
  );
}

export function PostTile({ post, base = "/blog/" }: { post: Post; base?: string }) {
  return (
    <li>
      <article className="tile">
        <h3>
          <Link href={`${base}${post.slug}/`}>{post.title}</Link>
        </h3>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
        {post.publishedAt ? (
          <div className="tile-foot">
            <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time>
          </div>
        ) : null}
      </article>
    </li>
  );
}
