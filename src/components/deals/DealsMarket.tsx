"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { CouponCard } from "@/components/deals/CouponCard";
import {
  couponHaystack,
  filterCoupons,
  isFiltered,
  marketQuery,
  MAX_QUERY,
  type CouponSort,
  type Market,
  type MarketState,
} from "@/lib/market";

const PAGE = 24;
const noopSubscribe = () => () => {};
const DEBOUNCE_MS = 180;

/** "Showing 24 of 73 matching deals", "3 deals". */
export function countLine(total: number, shown: number, filtered: boolean, noun: string): string {
  const what = `${filtered ? "matching " : ""}${noun}${total === 1 ? "" : "s"}`;
  return total > shown ? `Showing ${shown} of ${total.toLocaleString("en-US")} ${what}` : `${total.toLocaleString("en-US")} ${what}`;
}

const CHECK_LABEL = { checkout_tested: "Tested at checkout", source_verified: "Source checked" } as const;

const DEFAULTS: Omit<MarketState, "q"> = { category: undefined, brand: undefined, check: undefined, sort: "verified" };

/**
 * Search, filters and the All deals list of the Deals page. It works on the list the server already loaded (from the
 * cached catalog), so typing and filtering never reach the data source. State is mirrored in the URL with
 * replaceState, so a filtered view can be shared; those URLs are noindex. Without JavaScript the same controls are
 * plain links and GET forms, rendered on the server.
 */
export function DealsMarket({ market, initial }: { market: Market; initial: MarketState }) {
  const [state, setState] = useState<MarketState>(initial);
  const [draft, setDraft] = useState(initial.q);
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // False in the server HTML, true once the page runs in the browser (then the no-script Apply button goes away).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const uid = useId();

  const update = useCallback((patch: Partial<MarketState>) => {
    setState((s) => ({ ...s, ...patch }));
    setLimit(PAGE);
  }, []);

  // Typing filters after a short pause; the search box itself stays instant.
  useEffect(() => {
    if (draft === state.q) return;
    const t = window.setTimeout(() => update({ q: draft }), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [draft, state.q, update]);

  // Keep the address bar in step, without a navigation or a new history entry per keystroke.
  useEffect(() => {
    if (!hydrated) return;
    const next = `${window.location.pathname}${marketQuery(state)}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [state, hydrated]);

  // Search text is built once per record, not on every keystroke.
  const hay = useMemo(() => new Map(market.coupons.map((k) => [k.slug, couponHaystack(k)])), [market.coupons]);
  const list = useMemo(() => filterCoupons(market.coupons, state, (k) => hay.get(k.slug) ?? ""), [market.coupons, state, hay]);

  const filtered = isFiltered(state);
  const activeFilters = [state.category, state.check].filter(Boolean).length;
  // A brand filter arrives only from links elsewhere (e.g. a comparison table); it shows as a pill to clear.
  const brandName = state.brand ? market.coupons.find((k) => k.brandSlug === state.brand)?.brandName : undefined;
  const checks = useMemo(() => (["checkout_tested", "source_verified"] as const).filter((c) => market.coupons.some((k) => k.verification === c)), [market.coupons]);
  const hasEndDates = market.coupons.some((k) => k.expiresAt);

  const reset = () => {
    setDraft("");
    update({ q: "", ...DEFAULTS });
  };

  const total = market.coupons.length;
  const shown = Math.min(limit, list.length);

  if (total === 0) {
    return (
      <section className="mk-section mk-all" aria-labelledby={`${uid}-all`}>
        <h2 className="mk-h2" id={`${uid}-all`}>
          All deals
        </h2>
        <div className="state mk-empty">
          <p className="display">No verified deals right now</p>
          <p>
            A deal is listed only after its code or offer was checked at the source or at checkout, with its end date. None has passed that check yet,
            so nothing is listed rather than guessing.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/tools/">
              Browse AI tools
            </Link>
            <Link className="btn btn-ghost" href="/brands/">
              See all brands
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mk-section mk-all" aria-labelledby={`${uid}-all`}>
        <div className="mk-all-head">
          <h2 className="mk-h2" id={`${uid}-all`}>
            All deals
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm mk-filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls={`${uid}-filters`}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
        </div>

        {/* One row: Category, Sort by, then search. Two forms side by side (forms cannot nest). */}
        <div className="mk-toolbar">
          <form
            id={`${uid}-filters`}
            className="mk-filters"
            data-open={filtersOpen ? "true" : undefined}
            action="/deals/"
            method="get"
            aria-label="Filter deals"
            onSubmit={(e) => e.preventDefault()}
          >
            {state.q ? <input type="hidden" name="q" value={state.q} /> : null}
            {state.brand ? <input type="hidden" name="brand" value={state.brand} /> : null}
            {market.categories.length > 0 ? (
              <div className="field">
                <label htmlFor={`${uid}-cat`}>Category</label>
                <select
                  id={`${uid}-cat`}
                  name="category"
                  className="select mk-cat-select"
                  data-active={state.category ? "true" : undefined}
                  value={state.category ?? ""}
                  onChange={(e) => update({ category: e.target.value || undefined })}
                >
                  <option value="">All Categories ({total})</option>
                  {market.categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name} ({c.coupons})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {checks.length > 1 ? (
              <div className="field">
                <label htmlFor={`${uid}-check`}>How it was checked</label>
                <select
                  id={`${uid}-check`}
                  name="check"
                  className="select"
                  value={state.check ?? ""}
                  onChange={(e) => update({ check: (e.target.value || undefined) as MarketState["check"] })}
                >
                  <option value="">Any check</option>
                  {checks.map((c) => (
                    <option key={c} value={c}>
                      {CHECK_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor={`${uid}-sort`}>Sort by</label>
              <select id={`${uid}-sort`} name="sort" className="select" value={state.sort} onChange={(e) => update({ sort: e.target.value as CouponSort })}>
                <option value="verified">Recently checked</option>
                {hasEndDates ? <option value="ending">Ending soonest</option> : null}
                <option value="brand">Brand A to Z</option>
              </select>
            </div>
            {hydrated ? null : (
              <button type="submit" className="btn btn-dark" formNoValidate>
                Apply
              </button>
            )}
            {brandName ? (
              <button type="button" className="chip chip-clear mk-brand-clear" aria-label={`Remove brand filter: ${brandName}`} onClick={() => update({ brand: undefined })}>
                {brandName}
                <span aria-hidden="true" className="chip-x">
                  ×
                </span>
              </button>
            ) : null}
          </form>
          <form
            className="mk-search"
            role="search"
            action="/deals/"
            method="get"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: draft });
            }}
          >
            <label htmlFor={`${uid}-q`} className="sr-only">
              Search deals by brand, tool, code or discount
            </label>
            <input
              id={`${uid}-q`}
              className="mk-search-input"
              type="search"
              name="q"
              value={draft}
              maxLength={MAX_QUERY}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search a brand, tool, code or discount"
              onChange={(e) => setDraft(e.target.value)}
            />
            {state.category ? <input type="hidden" name="category" value={state.category} /> : null}
            <button type="submit" className="mk-search-go" aria-label="Search deals">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <path d="m20 20-3.6-3.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </form>
        </div>

        <p className="result-count mk-count" role="status" aria-live="polite">
          {countLine(list.length, shown, filtered, "deal")}
        </p>

        {list.length === 0 ? (
          <div className="state mk-empty">
            <p className="display">No deals match</p>
            <p>
              {state.q.trim() ? `Nothing matches “${state.q.trim()}” with these filters. ` : "Nothing fits these filters. "}
              Try a shorter word, another category, or reset the filters.
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={reset}>
                Reset filters
              </button>
              <Link className="btn btn-ghost" href="/brands/">
                See all brands
              </Link>
            </div>
          </div>
        ) : (
          <ul className="deal-list mk-coupons">
            {list.slice(0, shown).map((k) => (
              <CouponCard key={k.slug} coupon={k} />
            ))}
          </ul>
        )}

        {list.length > shown ? (
          <div className="mk-more">
            <button type="button" className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>
              Show {Math.min(PAGE, list.length - shown)} more
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
