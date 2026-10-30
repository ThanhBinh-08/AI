import Link from "next/link";
import { endsLabel, splitDiscount } from "@/components/cards/cards";
import { RevealCode } from "@/components/deals/RevealCode";
import { BrandLogo, OutboundLink, VerificationStatus } from "@/components/ui/bits";
import type { MarketCoupon } from "@/lib/market";

/**
 * One eligible coupon on the Deals page, drawn as the site's ticket row: discount in the dot-matrix face, brand,
 * title, conditions, check status and end date, then the exact code and the one outbound action.
 * Only coupons that passed `isEligibleCoupon` reach this card; it never decides eligibility itself.
 */
export function CouponCard({ coupon }: { coupon: MarketCoupon }) {
  const [big, rest] = splitDiscount(coupon.discount);
  const ends = endsLabel(coupon.expiresAt);
  return (
    <li className="deal-row coupon-row">
      <BrandLogo name={coupon.brandName} src={coupon.brandLogo} />
      <p className="deal-discount">
        <span className="deal-big">{big}</span>
        {rest ? <span className="deal-rest">{rest}</span> : null}
      </p>
      <div className="deal-body">
        <Link className="deal-brand" href={`/brands/${coupon.brandSlug}/`}>
          {coupon.brandName}
        </Link>
        <h3>
          <Link href={`/deals/${coupon.slug}/`}>{coupon.title || `${coupon.discount} at ${coupon.brandName}`}</Link>
        </h3>
        {coupon.terms ? <p className="coupon-terms">{coupon.terms}</p> : null}
        <div className="deal-meta">
          <VerificationStatus value={coupon.verification} at={coupon.verifiedAt} />
          <span className={ends.urgent ? "urgent" : undefined}>{ends.text}</span>
        </div>
      </div>
      <div className="deal-actions">
        {/* No code: the space stays empty, the deal applies through the link. */}
        {coupon.code ? <RevealCode slug={coupon.slug} href={coupon.goHref} label={`${coupon.brandName} ${coupon.discount}`} brand={coupon.brandSlug} offer={coupon.slug} placement="deals-market" /> : null}
        <OutboundLink href={coupon.goHref} size="sm" variant="dark" brand={coupon.brandSlug} offer={coupon.slug} from="deals-market" slug={coupon.slug}>
          Get Deal
        </OutboundLink>
      </div>
    </li>
  );
}
