import type { Metadata } from "next";
import Link from "next/link";
import { ToolTile } from "@/components/cards/cards";
import { AutoSubmit } from "@/components/ui/AutoSubmit";
import { ChipRail } from "@/components/ui/ChipRail";
import { EmptyState, PageHead, Pagination } from "@/components/ui/bits";
import { listToolsPaged, toolCategoryCounts } from "@/data/repository";
import { categoryParam, one, pageParam, withQuery, type SearchParams } from "@/lib/params";
import { pageMeta } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = Boolean(categoryParam(sp) || one(sp, "q"));
  return pageMeta({
    title: pageParam(sp) > 1 ? `AI tools directory, page ${pageParam(sp)}` : "AI tools directory",
    description: "AI tools for writing, images, video, coding, audio and work, with their features, checked prices and active deals.",
    path: withQuery("/tools/", { page: pageParam(sp) }),
    noindex: filtered,
  });
}

export default async function ToolsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const category = categoryParam(sp);
  const q = one(sp, "q");
  const page = pageParam(sp);
  const [result, categories, everything] = await Promise.all([listToolsPaged({ category, q, page }), toolCategoryCounts(), listToolsPaged({})]);
  const tools = result.items;
  const filtered = Boolean(category || q);

  return (
    <div className="container">
      <PageHead
        crumbs={[{ name: "Home", path: "/" }, { name: "AI Tools", path: "/tools/" }]}
        title="AI tools directory"
        lede="Only published tools are listed. Prices appear with the date they were last checked."
      />

      <form className="filters" action="/tools/" method="get" role="search" aria-label="Filter tools">
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label htmlFor="t-q">Search tools</label>
          <input id="t-q" className="input input-lg" type="search" name="q" defaultValue={q} maxLength={80} placeholder="Name or task, e.g. transcription" />
        </div>
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <button type="submit" className="btn btn-dark">
          Apply
        </button>
        {filtered ? (
          <Link href="/tools/" className="text-link" style={{ alignSelf: "center" }}>
            Clear
          </Link>
        ) : null}
        <AutoSubmit />
      </form>

      <ChipRail
        label="Tool categories"
        items={[
          { href: withQuery("/tools/", { q }), label: "All", count: everything.total, current: !category },
          ...categories.map((c) => ({ href: withQuery("/tools/", { q, category: c.slug }), label: c.name, count: c.count, current: category === c.slug })),
        ]}
      />

      <p className="result-count" role="status">
        {result.total === 1 ? "1 tool" : `${result.total} tools`}
      </p>

      {tools.length > 0 ? (
        <>
          <ul className="tiles">
            {tools.map((t) => (
              <ToolTile key={t.id} tool={t} />
            ))}
          </ul>
          <Pagination page={result.page} totalPages={result.totalPages} href={(n) => withQuery("/tools/", { q, category, page: n })} />
        </>
      ) : (
        <EmptyState
          title={filtered ? "No tools match" : "No tools listed yet"}
          actions={
            <Link className="btn btn-primary" href={filtered ? "/tools/" : "/deals/"}>
              {filtered ? "Show all tools" : "Browse deals"}
            </Link>
          }
        >
          {filtered ? "Try another word or remove the category filter." : "Tools appear here once they are reviewed and published."}
        </EmptyState>
      )}
    </div>
  );
}
