import { SITE } from "@/config/site";
import { readConfig } from "@/lib/analytics";

/**
 * Trust and legal pages. They describe what this code base actually does: analytics only when configured, no cookies of its
 * own, server logs kept by the host, contact messages forwarded only when a contact endpoint is configured.
 * If you add analytics, ads, a newsletter or accounts, update the privacy and cookie pages in the same change.
 */
export interface StaticPage {
  slug: string;
  title: string;
  description: string;
  updated: string;
  body: string;
}

const NAME = SITE.name;

// The privacy and cookie pages follow the analytics setting, so they always describe what the site really does.
const ANALYTICS = readConfig().provider !== null;
const ANALYTICS_CONSENT = readConfig().consentRequired;
const ANALYTICS_COLLECTED = `**Usage statistics.** We use Plausible Analytics to count page views and three actions on deals: a checked coupon being shown, the Copy button being pressed, and a partner link being followed. Each event records only the page, the brand, the deal and where the button was. Plausible sets no cookies, does not store IP addresses and reports only totals. Nothing is sent when your browser sends Do Not Track or Global Privacy Control${ANALYTICS_CONSENT ? ", or before you agree in the box at the bottom of the page" : ""}.

**Partner link clicks.** When you follow a partner link, our server writes one log line with the brand, the deal and the button's place on the page, without your IP address or browser details. We use the totals to see which deals are useful. A click is not a purchase; purchases are only reported to us by affiliate networks.`;
const SERVER_CLICKS = `**Partner link clicks.** When you follow a partner link, our server writes one log line with the brand, the deal and the button's place on the page, without your IP address or browser details. We use the totals to see which deals are useful.`;
const UPDATED = "2026-10-24";

export const STATIC_PAGES: StaticPage[] = [
  {
    slug: "about",
    title: `About ${NAME}`,
    description: `What ${NAME} is, who it is for, and how it is funded.`,
    updated: UPDATED,
    body: `${NAME} is an independent directory of AI tools and software deals for people and small teams in the United States who buy software for their work.

## What we do

- **List AI tools** with a plain description of what each one does, its features and, when we have checked it, its price and the date of that check.
- **Collect discount codes and deals** and show, for every one, where it came from, whether and when it was checked, its conditions and its end date.
- **Compare tools** side by side using the same checked facts, without scores or rankings we cannot back up.
- **Write guides** on choosing tools and buying software plans.

## What we do not do

- We do not sell software and do not handle payments. You buy directly from the brand.
- We do not publish ratings, reviews or test results we have not produced.
- We do not list a deal as active after its end date.

## Data sources

Some tool names, short descriptions, categories and pricing labels come from AI tool rankings from [AI Use Cases](https://aiusecases.dev), 2026, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). That data is not an endorsement or a quality judgement, and we have not independently checked it unless a page says so.

## How the site is funded

Some brands pay us a commission when you buy through our links. That is how the site is paid for. It does not change the price you pay or a deal's check status. The [affiliate disclosure](/affiliate-disclosure/) explains this in full.

## Get in touch

Found a code that no longer works, or a fact that is out of date? [Contact us](/contact/) and we will recheck it.`,
  },
  {
    slug: "how-we-review",
    title: "How we review tools and check deals",
    description: "Our process for listing AI tools, checking discount codes and comparing software, and the limits of that process.",
    updated: UPDATED,
    body: `This page explains what our labels mean and what they do not mean.

## Deal check status

Every deal carries one of three labels, with a date when there is one:

- **Not yet checked.** The code was recorded, but nobody has confirmed it.
- **Source checked.** We confirmed the code and the discount against the brand's own page, email, partner listing or another published source on the date shown. We did not enter it at checkout.
- **Tested at checkout.** Someone entered the code at the brand's checkout on the date shown and saw the discount applied before paying. We do not complete purchases to test codes.

A label is a record of what happened on a date, not a promise that the code still works today. Brands change or end promotions without notice.

## End dates and expired deals

If a brand publishes an end date, we show it. When that date passes, the deal leaves every list automatically, its code is hidden, and its page stays only as a record with a link to the brand's current deals. If no end date is published, we say so instead of guessing one.

## Tool information

Tool pages list features, typical uses, strengths and limitations only when we have recorded them from the brand's documentation, pricing pages or our own use. Prices are shown only together with the date they were checked. When we have nothing checked, the page says so.

## Comparisons and alternatives

Comparison tables place the same recorded facts side by side. We do not compute scores or declare winners. An empty cell means we have no checked information, not that a feature is missing.

## What we do not claim

- We do not claim to have tested a tool unless a page says so explicitly.
- We do not invent ratings, user counts or testimonials.
- We are not an official partner of the brands listed unless a page says so.

## Corrections

If something here is wrong or out of date, [tell us](/contact/). We recheck reported deals and update the page and its check date.`,
  },
  {
    slug: "affiliate-disclosure",
    title: "Affiliate disclosure",
    description: `How ${NAME} earns money from affiliate links, and what that means for you.`,
    updated: UPDATED,
    body: `${NAME} is reader-supported. Some links on this site are affiliate links: if you click one and then buy, the brand may pay us a commission.

## Which links are affiliate links

Buttons such as **Get deal**, **Go to** and **Visit** send you through a redirect on our own domain (addresses starting with \`/go/\`) to the brand's affiliate link. These links are marked as sponsored for search engines. Links to our own pages are not affiliate links.

## What it costs you

Nothing. The commission is paid by the brand. The price you pay is the same with or without our link, and discount codes work the same way.

## How commissions affect what we publish

- A brand cannot pay to change a deal's check status, its position in our lists or the facts in a comparison.
- We list deals from brands with and without affiliate programs.
- Deals leave our lists when they expire, regardless of commission.

## Relationship with brands

Being in a brand's affiliate program does not make us its official partner or reseller. Unless a page states otherwise, we have no other business relationship with the brands we list.

This disclosure follows the U.S. Federal Trade Commission's guidance on endorsements. Questions? [Contact us](/contact/).`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy policy",
    description: `What personal information ${NAME} collects, why, how long it is kept and your choices.`,
    updated: UPDATED,
    body: `This policy explains what information this website handles. It is written to match how the site works today; when that changes, we update this page and its date.

## Information we collect

**Server logs.** Like every website, our hosting provider records technical data for each request: IP address, browser user agent, the page requested, the referring page and the time. These logs are used to run the site, investigate errors and stop abuse, and are kept for the period set by the hosting provider.

**Rate limiting.** To slow down automated abuse, the server counts requests per IP address for a few minutes in memory. These counters are not stored or shared.

${ANALYTICS ? ANALYTICS_COLLECTED : SERVER_CLICKS}

**Contact messages.** If you use the contact form, we receive your name, email address and message. We use them only to answer you and to fix what you report. Messages are deleted within 12 months of our last reply, or sooner if you ask.

## What we do not collect

${ANALYTICS ? "- We do not use advertising or cross-site tracking scripts, and our statistics tool uses no cookies." : "- We do not use analytics, advertising or tracking scripts."}
- We do not set cookies. See the [cookie policy](/cookie-policy/).
- We do not have user accounts and do not ask for payment information.
- We do not sell or share personal information, as those terms are defined in the California Consumer Privacy Act.

## Third parties

- **Font provider.** Our display font is loaded from an external font service, which receives your IP address and browser details when the font is requested.
- **Brands and affiliate networks.** When you follow a deal link, you leave this site. The brand's site and its affiliate network may set cookies and collect data under their own privacy policies.
- **Contact form processor.** Contact messages are delivered to us through a form-processing service, which stores them on our behalf.

## Your choices and rights

You can ask what contact information we hold about you, ask us to correct it, or ask us to delete it, by writing to us through the [contact page](/contact/). We do not discriminate against anyone for exercising these rights.

## Children

This site is not directed at children under 13, and we do not knowingly collect their information.

## Changes

If we change how we handle information, we will update this page and its date at the top.`,
  },
  {
    slug: "terms",
    title: "Terms of use",
    description: `The terms that apply when you use ${NAME}.`,
    updated: UPDATED,
    body: `By using this website you agree to these terms. If you do not agree, please do not use the site.

## What the site provides

${NAME} publishes information about AI tools and software deals, including discount codes, prices, features and comparisons. The information is provided for general guidance. See the [disclaimer](/disclaimer/) for its limits.

## Purchases happen elsewhere

We do not sell products or process payments. When you buy from a brand you enter into an agreement with that brand, under its terms, prices and refund policy. We are not responsible for a brand's products, services, billing or support.

## Acceptable use

You agree not to:

- copy large parts of the site or its data by automated means, or use the site to build a competing database;
- try to interfere with the site's operation, security or rate limits;
- submit false, abusive or unlawful content through the contact form.

## Intellectual property

The site's text, design and code belong to us or our licensors. Brand names and logos belong to their owners and are used only to identify their products.

## No warranty

The site is provided "as is", without warranties of any kind. We do not guarantee that a code will work, that information is current, or that the site will be available without interruption.

## Limitation of liability

To the extent permitted by law, we are not liable for any loss arising from your use of the site or from purchases made with brands linked from it.

## Links to other sites

Links to other websites are provided for convenience. We do not control those sites and are not responsible for their content or practices.

## Changes

We may update these terms. The date at the top shows the latest version; continuing to use the site means you accept it.`,
  },
  {
    slug: "disclaimer",
    title: "Disclaimer",
    description: "Prices, coupon codes, features and offers change. What our information can and cannot tell you.",
    updated: UPDATED,
    body: `## Information changes

Prices, discount codes, plan limits, features and promotions are set by each brand and can change at any time without notice. We show the date we last checked a price or a code, but we cannot guarantee that it is still accurate when you read it.

## Codes are not guaranteed

A code labelled **source checked** or **tested at checkout** worked or was published on the date shown. It may since have expired, reached its usage limit, or been restricted to certain plans, regions or new customers. Always confirm the final price at checkout before you pay.

## Not professional advice

Our guides and comparisons are general information, not legal, financial, tax or security advice. Check that a tool meets your own requirements, including data protection and licensing for commercial use.

## Trademarks

Product and company names are trademarks of their owners. Their use here does not imply endorsement by, or affiliation with, those owners. See the [affiliate disclosure](/affiliate-disclosure/) for how we are funded.`,
  },
  {
    slug: "cookie-policy",
    title: "Cookie policy",
    description: `Which cookies ${NAME} uses (none of its own) and what happens on brand sites.`,
    updated: UPDATED,
    body: `## Cookies on this site

${ANALYTICS ? `This website does not set cookies. It counts page views and clicks on deals with Plausible Analytics, which uses no cookies and stores no personal data.${ANALYTICS_CONSENT ? " It asks for your agreement first and remembers your answer in your browser's local storage (not a cookie)." : " For that reason there is no cookie banner."}` : "This website does not set cookies and does not use analytics, advertising or tracking scripts. For that reason there is no cookie banner."}

Your browser may store files such as fonts and images in its cache to load pages faster. These are not cookies and contain no personal information.

## Cookies after you leave

When you follow a deal or a **Visit** link, you go to the brand's website through its affiliate network. Those sites may set their own cookies, for example to record that you arrived from our link, under their own cookie and privacy policies. You can block or delete them in your browser settings.

## Changes

If we ever add a feature that uses cookies, we will update this page first and ask for consent where the law requires it.`,
  },
];

export function staticPage(slug: string): StaticPage | undefined {
  return STATIC_PAGES.find((p) => p.slug === slug);
}
