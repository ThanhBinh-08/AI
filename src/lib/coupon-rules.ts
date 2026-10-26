import { isPast } from "@/lib/dates";
import type { Brand, Coupon, Verification } from "@/types/catalog";

/*
 * The one set of coupon rules. Every page that lists, counts or promotes a coupon uses these functions, so a code
 * is never shown as an active, checked deal in one place and hidden in another.
 */

/** Published and not past its last valid day (UTC, inclusive). A coupon without an end date stays live. */
export function isLiveCoupon(c: Pick<Coupon, "status" | "expiresAt">, now: Date = new Date()): boolean {
  return c.status === "published" && !isPast(c.expiresAt, now);
}

/** Someone checked it, at its source or at checkout. Having a code is not a check. */
export const isCheckedVerification = (v: Verification): boolean => v !== "unverified";

/**
 * A coupon the site may promote as a verified deal: live, checked, with a discount, and belonging to a published
 * brand. Expired, unchecked, draft or orphaned coupons are never eligible.
 */
export function isEligibleCoupon(
  c: Pick<Coupon, "status" | "expiresAt" | "verification" | "discount">,
  brand: Pick<Brand, "status"> | undefined,
  now: Date = new Date(),
): boolean {
  return brand?.status === "published" && c.discount.trim() !== "" && isCheckedVerification(c.verification) && isLiveCoupon(c, now);
}

/**
 * Routes that must never render a coupon code, a copy control or a coupon card: the Blog stays editorial.
 * Checked in code (not hidden with CSS) by every component that renders a code.
 */
export function isCouponFreeRoute(pathname: string | null | undefined): boolean {
  return /^\/blog(\/|$)/.test(pathname ?? "");
}
