import type { Post } from "@/types/catalog";

/**
 * Guides that ship with the site. They describe general practice only — no claims about specific products,
 * prices or test results. Posts from the Sheet's Content tab are listed next to them.
 */
const base = {
  type: "blog" as const,
  seoTitle: null,
  seoDescription: null,
  updatedAt: null,
  author: null,
  brandId: null,
  productId: null,
  productIds: [],
  status: "published" as const,
};

export const ARTICLES: Post[] = [
  {
    ...base,
    id: "guide-check-coupon",
    slug: "how-to-check-a-software-coupon-code",
    title: "How to check a software coupon code before you pay",
    excerpt: "A short routine for confirming a discount code applies to the plan you want, before any money changes hands.",
    publishedAt: "2026-10-22",
    body: `Most software coupon codes fail for boring reasons: the code has expired, it only applies to a different plan, or it is limited to new accounts. A two-minute check before checkout avoids most surprises.

## 1. Read the conditions first

Every deal on this site lists its conditions and expiry date when we have them. Look for:

- **Plan limits.** Many codes apply only to annual plans, or only to one tier.
- **New-customer limits.** A code may not work on an account that already had a subscription.
- **Region limits.** Some offers are only valid in certain countries or currencies.

If a deal shows no conditions, that means none were published at the source — not that there are none.

## 2. Look at the check status

Each deal carries one of three labels:

- **Not yet checked** — the code was collected but nobody has confirmed it.
- **Source checked** — we confirmed the code and discount against the brand's own page, newsletter or partner listing on the date shown.
- **Tested at checkout** — someone entered the code at the brand's checkout on the date shown and saw the discount applied.

None of these is a guarantee for today: brands can end a promotion at any time.

## 3. Apply the code before entering payment details

On most checkout pages the discount field sits next to the order summary. Enter the code, then confirm that the **total** changed — not just that a green message appeared. If the total is unchanged, the code did not apply.

## 4. Check what happens at renewal

A first-year discount often renews at the full price. Before you confirm, look for the renewal price and date in the order summary or the plan terms, and set a reminder a week before renewal if you may want to cancel.

## 5. If a code fails

Try the plan the code is meant for, sign out and back in, or remove other promotions from the cart. If it still fails, the offer has probably ended. You can [send us a note](/contact/) so we can recheck it.`,
  },
  {
    ...base,
    id: "guide-annual-plan",
    slug: "questions-before-buying-an-annual-ai-plan",
    title: "Seven questions to answer before buying an annual AI plan",
    excerpt: "Annual plans usually cost less per month, but they lock you in. These questions help you decide whether the discount is worth it.",
    publishedAt: "2026-10-22",
    body: `Annual billing is the most common way AI tools discount their plans. The saving is real, but so is the commitment. Answer these questions first.

## 1. Have you used the tool for real work?

A free plan or trial with your own files and tasks tells you more than any feature list. If there is no trial, a single month on monthly billing is often cheaper than a year you do not use.

## 2. What exactly is limited?

AI plans are often limited by credits, messages, generations, minutes of audio or video, seats or projects. Find the limit that matters for your work and estimate how quickly you would reach it.

## 3. What happens when you hit the limit?

Some tools slow down, some stop, and some charge for extra usage. Check whether overage is billed automatically.

## 4. Who owns the output, and how is your data used?

Read the terms for commercial use of generated content and whether your inputs may be used to train models. Business plans sometimes differ from individual plans here.

## 5. Can you get a refund?

Look for the refund window in the terms. Some companies refund unused annual time; many do not.

## 6. What is the renewal price?

Introductory and coupon discounts often apply only to the first billing period. Compare the renewal price, not just the first payment.

## 7. Can you export your work?

If you leave after a year, can you take your documents, images, prompts or projects with you, and in what format?

If the answers still favor the annual plan, check our [deals](/deals/) for a code that applies to it, and read the conditions listed with each one.`,
  },
  {
    ...base,
    id: "guide-affiliate-links",
    slug: "how-affiliate-links-and-discount-codes-work",
    title: "How affiliate links and discount codes work",
    excerpt: "What happens when you click a deal on a site like this one, who pays the commission, and what it does not change.",
    publishedAt: "2026-10-22",
    body: `Many software companies run affiliate programs: they pay a commission to sites that send them customers. This site is funded that way. Here is what that means for you.

## What happens when you click

Buttons such as **Get deal** or **Visit site** go through a short redirect on our domain (for example \`/go/brand-id/\`). It sends you to the brand's affiliate link, which lets the brand's affiliate network record that the visit came from us. If you then buy, the brand may pay us a commission.

## Who pays

The commission is paid by the brand, out of its marketing budget. You pay the same price you would pay without the link, and any discount code works the same way.

## What it does not change

- We do not accept payment to change a deal's check status.
- Deals are listed when they meet our publishing rules, not according to commission rates.
- When a deal expires, it is removed from the lists even if the brand still pays commission.

## Codes and links are separate

A discount code is entered at checkout; an affiliate link only records where you came from. You can use a code without our link, and the link works without a code.

## Cookies and tracking

This site itself does not set tracking cookies. After the redirect, the brand's site and its affiliate network may set their own cookies under their own privacy policies. Our [affiliate disclosure](/affiliate-disclosure/) and [privacy policy](/privacy-policy/) cover the details.`,
  },
];
