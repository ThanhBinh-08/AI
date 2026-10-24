# AI Tools & Deals

Affiliate directory of AI tools and software deals for U.S. readers. Next.js 16 (App Router) + React 19 + TypeScript,
Google Sheets as the content source (read-only). The original one-page design (video background, pill header,
dot-matrix headline, count-up stats) lives on as the Home hero; its CSS is `src/styles/hero.css` and the original
static page is kept in `legacy/` for reference.

## Commands

```bash
npm install
npm run dev                 # http://localhost:3400
npm run build && npm start  # production build and server (port 3400)
npm run typecheck
npm run lint
npm test                    # Vitest
npm run smoke -- http://localhost:3400 [--expect-site=https://your.domain] [--with-data]   # against a running build
npm run check:sheet         # read the live Sheet once and list issues (needs .env.local)
npm run detect:brand -- "<affiliate url>" [--follow]                                    # brand suggestion, writes nothing
node scripts/screens.mjs http://localhost:3400 ./screens                                # screenshots with local Chrome
```

Local preview with sample data: `DATA_SOURCE=fixture npm run dev` (only works while `NEXT_PUBLIC_SITE_URL` is localhost).
Do not run `next build` while `next dev` is running in the same folder (they share `.next`).

## Configuration

Copy `.env.example` to `.env.local` (never commit it). In production set at least:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical https origin, e.g. `https://www.example.com`. Used in canonicals, OG, sitemap. Set at **build** time. |
| `NEXT_PUBLIC_SITE_NAME` | Site name in titles, header, footer. |
| `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Read-only Sheets access. Share the Sheet with the service account as **Viewer**. |
| `REVALIDATE_SECRET` | 32+ characters; protects `POST /api/revalidate/` and the issue list on `/api/health/`. |
| `CONTACT_WEBHOOK_URL` / `CONTACT_EMAIL` | Contact form endpoint (https) and/or a public address. Without both, `/contact/` says the form is unavailable. |
| `AFFILIATE_EXTRA_HOSTS` | Extra affiliate hosts allowed in `/go/` besides each brand's `domain` and the list in `src/lib/affiliate.ts`. |
| `NOINDEX=1` | Staging/preview: noindex everywhere, robots.txt disallows all, sitemap empty. |

Indexing is enabled only when `NEXT_PUBLIC_SITE_URL` is https, not localhost, and `NOINDEX` is unset.

## Google Sheet

Start from `docs/sheet-template.xlsx` (File → Import in Google Sheets): the four tabs with their headers,
dropdowns for status columns and a note on each header. Four tabs, columns read by header name (case and spaces ignored). Bad rows are skipped and reported by
`npm run check:sheet` and `/api/health/` (with the secret header); one bad row never breaks the site.

**Brands** — `brand_id`*, `name`*, `slug`, `logo_url`, `description`, `category`, `domain`, `affiliate_url`,
`affiliate_program_status` (approved/pending/paused/rejected), `status` (published/draft/pending/archived), `updated_at`

**Coupons** — `coupon_id`*, `brand_id`*, `discount`*, `code`, `title`, `terms`, `expires_at`, `source_url`,
`verification_status` (unverified/source_verified/checkout_tested), `verified_at`, `status` (published/draft/expired/invalid)

**Products** (tools) — `product_id`*, `brand_id`*, `name`*, `slug`, `description`, `image_url`, `category`, `pricing`,
`pricing_checked_at`, `pricing_source_url`, `features`, `use_cases`, `pros`, `cons` (one item per line or `;`), `status`

**Content** — `content_id`*, `type`* (blog/compare/alternatives), `title`*, `slug`*, `excerpt`, `body` (Markdown subset),
`seo_title`, `seo_description`, `status`, `published_at`, `updated_at`, `author`, `brand_id`, `product_id`, `product_ids`

Rules enforced in code (`src/data/schemas/parse.ts`, `src/data/repository.ts`):

- The affiliate URL exists **only on the brand**. Every deal/tool CTA of that brand goes to `/go/<brand_id>/`, which
  redirects (302, no-store) to that one URL — only if the brand is published, the program approved and the URL is https
  on the brand `domain`, a known network or `AFFILIATE_EXTRA_HOSTS`. Nothing from the request is ever a destination.
- `source_url` is reference only (its hostname is shown as text, never linked or redirected to).
- Dates: `YYYY-MM-DD` or real Sheet dates. Slash dates (`10/11/2026`) are ambiguous and rejected — nothing is guessed.
- `checkout_tested` / `source_verified` need `verified_at`, otherwise the deal shows as not yet checked.
- A deal is listed while published and not past `expires_at` (inclusive, UTC). Expired deals keep a noindex page with
  the code hidden and a link to the brand's current deals.
- Prices show only with `pricing_checked_at`. Tool pages without features/uses/pros/cons/price are noindex.
- Categories (fixed list in `src/config/categories.ts`) appear only when something is published in them.
- Comparisons need two published tools; alternatives a published subject plus one alternative (noindex without body text).

Brand onboarding: `npm run detect:brand -- "<affiliate url>" --follow` suggests name/slug/domain (status "pending").
It follows redirects with HEAD only, max 5 hops, 5 s timeout, and refuses private/loopback/metadata addresses at
socket level. Check the suggestion, add the row, then set `status=published` yourself.

Cache: the catalog is held in memory for `SHEET_CACHE_TTL_SECONDS` (default 300 s), one refresh at a time, last good
copy served if Google fails. Pages use ISR (5 min). `POST /api/revalidate/` with header `x-revalidate-secret` refreshes now.

Moving to PostgreSQL later: implement `SheetSource` (or replace `getParsedCatalog` in `src/data/store.ts`) — pages only
use `src/data/repository.ts` and the types in `src/types/catalog.ts` (enforced by ESLint).

## AI-directory database (8-tab layout)

Set `SHEET_LAYOUT=normalized` to read this layout; it is adapted onto the pages above (a tool becomes a Brand + Product
with the same id), so routes, `/go/` redirects, cache and SEO are unchanged. Tabs and keys (`src/data/normalized/schema.ts`):

| Tab | Primary key | Foreign keys / unique |
| --- | --- | --- |
| Settings | `setting_key` | |
| Categories | `category_id` (CAT001...) | `parent_category_id` → Categories; `slug` unique |
| Tools | `tool_id` (T0001...) | `slug` unique |
| Tool_Categories | `tool_category_id` | `tool_id` → Tools, `category_id` → Categories; one pair once, one `is_primary` per tool |
| Tool_Alternatives | `alternative_id` | `tool_id`, `alternative_tool_id` → Tools, never equal |
| Deals | `deal_id` | `tool_id` → Tools |
| Blog_Posts | `post_id` | `slug` unique |
| Import_Log | `import_id` | audit only |

Category slugs must be those of `src/config/categories.ts` (the Categories tab is seeded from it). Integrity (PK, FK, slugs,
duplicates, enums, https URLs) is checked on every read; bad rows are skipped and listed on `/api/health/`.

- **Create the database:** create an empty Google spreadsheet, share it with the service account (Editor), then
  `npm run db:create -- --create --into <spreadsheetId>` (adds the tabs, headers, dropdowns, seed categories/settings; refuses
  non-empty tabs). Put the id in `GOOGLE_SHEET_ID` and set `SHEET_LAYOUT=normalized`.
- **Licensed dataset (recommended source):** `npm run db:fetch` downloads https://aiusecases.dev/data.json once (CC BY 4.0, robots Allow)
  into `local-data/aiusecases.json` (name, tagline, official URL, pricing label, categories; no logos, rankings or editorial text).
  Then `npm run db:import -- --sample local-data/aiusecases.json` (dry run) and `... --apply` to append to the Sheet. **Attribution is
  required while these records are used**: it is on the About page and in the Settings tab (`data_attribution`).
- **Preview import:** `npm run db:crawl` (one-off, polite, stops on 403/429) writes `local-data/toolify-sample.json`;
  `npm run db:import` is a dry run, `-- --apply` appends rows (idempotent by `source_url`, never overwrites, reads back and validates).
  Imported rows are `preview_import` / `unverified` / `preview`, without affiliate link, price or logo.
- **Preview vs production:** `preview` rows are hidden unless `SHOW_PREVIEW_RECORDS=1` on a non-indexable site, are labelled
  "Sample data" and noindex. To make a tool real: edit the row in place (keep `tool_id` and `slug`), set
  `data_source_type=manually_entered`, `publish_status=published`, and add `affiliate_url` when you have one.
- **Checked tools (tool page content):** a tool page shows features, use cases, platforms, strengths/limitations and price only
  when the row has `verification_status=verified` (sample rows never count as verified). Optional hand-added columns at the end
  of the Tools tab: `features`, `use_cases`, `platforms`, `pros`, `cons` (one item per line, or separated by `|`). Only checked
  deals are shown as deals on a tool page. A tool page is indexed only when it is verified, not sample data, and has content.
  The logo shown for a tool everywhere (tool page, deals, blog covers) is its own `Tools.logo_url`, joined by `tool_id`.
- **Local layout test with fictional data:** `npm run db:sample`, then
  `DATA_SOURCE=local-json LOCAL_DATA_FILE=<abs path>/local-data/sample-normalized.json SHOW_PREVIEW_RECORDS=1 NEXT_DIST_DIR=.next-preview npm run dev:preview`.
- **After editing the Sheet:** the site refreshes within `SHEET_CACHE_TTL_SECONDS` (default 5 min, pages ISR 5 min), or at once with
  `POST /api/revalidate/` and header `x-revalidate-secret`.

## Blog

`/blog/` lists guides (posts without a tool) and tool profiles (Blog_Posts rows with `post_type=review`), with search, type and
category filters (filtered views are noindex) and pagination. A post page has a spec sheet and table of contents beside the text, the
tool and its deals below, an author panel, related posts and a "send a correction" strip for tool makers. `/feed.xml` is an RSS feed
(empty on non-indexable hosts, like the sitemap). To write as yourself, set `NEXT_PUBLIC_AUTHOR_NAME`, `NEXT_PUBLIC_AUTHOR_ROLE` and
`NEXT_PUBLIC_AUTHOR_BIO`; and put your name in the `author` column of a post for its byline. A post about a tool is public only while
that tool is public.

Post types: **Guide**, **Comparison**, **Review**. A `review` about a tool that is not `verified` is a directory-data
**Tool profile**: shown with that label (titles say "profile", not "review"), its ranking/evidence-signal sections are not shown,
and it is noindex. A post is indexed (and listed in the sitemap and feed) only when it is not a tool profile, not sample data,
has a publish date and at least 300 words. Sample bylines ("Sample", "fictional") are never shown.

## Deals, partner links and measurement

- **What is promoted:** only live deals that were checked (`source_verified`/`checkout_tested` with a date). Unchecked codes
  are never listed, counted, featured, searched or put in the sitemap; their own page stays reachable, marked and noindex.
- **Partner links:** every outbound CTA goes to `/go/<tool_id>/`, which redirects to that tool's one `affiliate_url`
  (validated server-side; the query only labels the click). No approved link = no button and no substitute URL.
  CTA wording: "Get deal" (checked deal + partner link), "Visit <tool>" (partner link, no discount implied).
- **Blog:** never shows codes or copy buttons; deals are named with a link to their deal page.
- **Server click log:** each `/go` click writes `[go] click brand=… offer=… from=…` (no IP or user agent) to the host's logs.
- **Analytics (off by default):** set `NEXT_PUBLIC_ANALYTICS_PROVIDER=plausible` and `NEXT_PUBLIC_ANALYTICS_DOMAIN` to send
  page views plus `coupon_impression`, `copy_code`, `affiliate_click` (props: page_type, brand, offer, placement) to Plausible.
  Do Not Track / GPC are respected; `NEXT_PUBLIC_ANALYTICS_CONSENT=required` asks first. The privacy and cookie pages change
  with the setting. Clicks are not sales: sales come only from the affiliate networks' reports.
- **Baseline and experiments:** before any A/B test, collect a baseline of coupon-to-click rate (affiliate_click / coupon_impression)
  per page type and placement. Test one variable at a time (for example the offer-card CTA wording) and only with enough
  traffic for a conclusive result; there is no A/B framework in the code yet.

## Known limitations

- `notFound()` inside a page (unknown deal/tool/brand slug) returns a correct 404 + noindex, but with Next 16.4 the
  404 content is rendered from the client payload (empty server HTML). Unmatched URLs are fully server-rendered.
- Rate limits are per process, in memory. Behind several instances or under attack, add CDN/WAF rules.
- The display font (BubbledotICG) loads from db.onlinewebfonts.com, as in the original design. Confirm its licence,
  or self-host a licensed copy in `public/fonts/` and update `src/app/layout.tsx`.
- Legal pages (`src/content/pages.ts`) describe the current behaviour (no analytics, no own cookies). Have them
  reviewed, and update them before adding analytics, ads, newsletters or accounts.
