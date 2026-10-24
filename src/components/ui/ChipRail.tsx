import Link from "next/link";

export interface RailItem {
  href: string;
  label: string;
  count?: number;
  current?: boolean;
  /** 0-3: draws a dot in the category colour before the label. */
  tone?: number;
}

/** Category filter as links (no script needed): the current one is filled, the rest scroll sideways on phones. */
export function ChipRail({ items, label }: { items: RailItem[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="chip-rail">
        {items.map((i) => (
          <li key={i.href}>
            <Link className="chip" href={i.href} aria-current={i.current ? "true" : undefined}>
              {i.tone !== undefined ? <span className="tone-dot" data-tone={i.tone} aria-hidden="true" /> : null}
              {i.label}
              {i.count !== undefined ? <span className="count">{i.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
