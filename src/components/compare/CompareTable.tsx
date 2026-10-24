import Link from "next/link";
import type { ReactNode } from "react";
import { categoryBySlug } from "@/config/categories";
import { formatDay } from "@/lib/dates";
import type { Brand, Product } from "@/types/catalog";
import { GoLink } from "@/components/ui/bits";

type Tool = Product & { brand: Brand; activeDeals: number };

function Cell({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="muted">Not reviewed yet</span>;
  return (
    <ul>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

/**
 * Side-by-side facts from the directory. Every cell is data from the Sheet; a missing value says so
 * instead of being filled in. No scores or rankings are computed. The first column stays visible when
 * the table scrolls sideways on small screens.
 */
export function CompareTable({ tools, caption }: { tools: Tool[]; caption: string }) {
  const rows: { label: string; cell: (t: Tool) => ReactNode }[] = [
    { label: "Made by", cell: (t) => <Link href={`/brands/${t.brand.slug}/`}>{t.brand.name}</Link> },
    { label: "Category", cell: (t) => t.categories.map((c) => categoryBySlug(c)?.name).join(", ") || <span className="muted">Not set</span> },
    {
      label: "Pricing",
      cell: (t) =>
        t.pricing ? (
          <>
            {t.pricing}
            <br />
            <span className="muted" style={{ fontSize: 13 }}>
              Checked {formatDay(t.pricingCheckedAt!)}
              {t.pricingSourceHost ? ` on ${t.pricingSourceHost}` : ""}
            </span>
          </>
        ) : (
          <span className="muted">No checked price</span>
        ),
    },
    { label: "Features", cell: (t) => <Cell items={t.features} /> },
    { label: "Good fit for", cell: (t) => <Cell items={t.useCases} /> },
    { label: "Strengths", cell: (t) => <Cell items={t.pros} /> },
    { label: "Limitations", cell: (t) => <Cell items={t.cons} /> },
    { label: "Checked deals", cell: (t) => (t.activeDeals > 0 ? <Link href={`/deals/?brand=${t.brand.slug}`}>{t.activeDeals === 1 ? "1 deal" : `${t.activeDeals} deals`}</Link> : "None") },
    {
      label: "Link",
      cell: (t) => (
        <GoLink brandId={t.brand.id} enabled={t.brand.hasAffiliate} size="sm" variant="dark" from="compare">
          Visit {t.brand.name}
        </GoLink>
      ),
    },
  ];

  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={`${caption}, scrolls sideways`}>
      <table className="compare-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <td />
            {tools.map((t) => (
              <th key={t.id} scope="col">
                <Link href={`/tools/${t.slug}/`}>{t.name}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {tools.map((t) => (
                <td key={t.id}>{r.cell(t)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
