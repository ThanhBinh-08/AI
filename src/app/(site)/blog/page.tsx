import type { Metadata } from "next";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import Link from "next/link";
import { Feature, KIND_PLURAL, MakerStrip, StoryGrid } from "@/components/blog/blog";
import { AutoSubmit } from "@/components/ui/AutoSubmit";
import { ChipRail } from "@/components/ui/ChipRail";
import { Breadcrumbs, EmptyState, Pagination, SectionHead } from "@/components/ui/bits";
import { blogFacets, listBlog, listFeaturedDeals } from "@/data/repository";
import { categoryParam, enumParam, one, pageParam, withQuery, type SearchParams } from "@/lib/params";
import { pageMeta } from "@/lib/seo";
import { toneOfCategory } from "@/lib/tone";
import type { BlogKind } from "@/types/catalog";

type Props = { searchParams: Promise<SearchParams> };

const KINDS: readonly BlogKind[] = ["review", "guide", "comparison"];

function readFilters(sp: SearchParams) {
  return { kind: enumParam(sp, "kind", KINDS), category: categoryParam(sp), q: one(sp, "q") || undefined, page: pageParam(sp) };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = readFilters(await searchParams);
  const filtered = Boolean(f.kind || f.category || f.q);
  const meta = pageMeta({
    title: f.page > 1 ? `Blog, page ${f.page}` : "Blog: guides and AI tool profiles",
    description: "Guides on choosing AI tools and software deals, and plain-language profiles of the tools in our directory.",
    // Filtered and searched views repeat the same posts in another order: they point at the plain list and stay out of the index.
    path: filtered ? "/blog/" : withQuery("/blog/", { page: f.page }),
    noindex: filtered,
  });
  return { ...meta, alternates: { ...meta.alternates, types: { "application/rss+xml": "/feed.xml" } } };
}

export default async function BlogPage({ searchParams }: Props) {
  const featured = await listFeaturedDeals();
  const f = readFilters(await searchParams);
  const filtered = Boolean(f.kind || f.category || f.q);
  const home = !filtered && f.page === 1;
  const [facets, result, guides] = await Promise.all([
    blogFacets(),
    listBlog(filtered ? f : { kind: "review", page: f.page }),
    home ? listBlog({ kind: "guide" }) : Promise.resolve(null),
  ]);
  const q = { kind: f.kind, category: f.category, q: f.q };
  const [lead, ...rest] = guides?.items ?? [];

  return (
    <div className="container">
      <header className="blog-mast">
        <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Blog", path: "/blog/" }]} />
        <div className="blog-mast-row">
          <h1 className="blog-wordmark">Blog</h1>
          <p className="blog-lede">
            Guides on choosing AI tools and software deals, and plain-language profiles of the tools in the directory. Every figure says where it came
            from.
          </p>
        </div>
      </header>

      <form className="filters" action="/blog/" method="get" role="search" aria-label="Search the blog">
        {f.kind ? <input type="hidden" name="kind" value={f.kind} /> : null}
        {f.category ? <input type="hidden" name="category" value={f.category} /> : null}
        <div className="field" style={{ flex: "1 1 280px" }}>
          <label htmlFor="b-q">Search the blog</label>
          <input id="b-q" className="input input-lg" type="search" name="q" defaultValue={f.q ?? ""} maxLength={80} placeholder="A tool or a topic, e.g. transcription" />
        </div>
        <button type="submit" className="btn btn-dark">
          Search
        </button>
        {filtered ? (
          <Link href="/blog/" className="text-link" style={{ alignSelf: "center" }}>
            Clear
          </Link>
        ) : null}
        <AutoSubmit />
      </form>

      <ChipRail
        label="Post types"
        items={[
          { href: withQuery("/blog/", { category: f.category, q: f.q }), label: "All", count: facets.total, current: !f.kind },
          ...facets.kinds.map((k) => ({ href: withQuery("/blog/", { ...q, kind: k.kind }), label: KIND_PLURAL[k.kind], count: k.count, current: f.kind === k.kind })),
        ]}
      />
      {facets.categories.length > 0 ? (
        <ChipRail
          label="Categories"
          items={facets.categories.map((c) => ({ href: withQuery("/blog/", { ...q, category: f.category === c.slug ? undefined : c.slug }), label: c.name, count: c.count, current: f.category === c.slug, tone: toneOfCategory(c.slug) }))}
        />
      ) : null}

      {lead ? (
        <section className="blog-block" aria-labelledby="blog-guides">
          <h2 className="sr-only" id="blog-guides">
            Start here
          </h2>
          <Feature post={lead} />
          {rest.length > 0 ? <StoryGrid posts={rest.slice(0, 3)} /> : null}
        </section>
      ) : null}

      <section className="blog-block" aria-labelledby="blog-index">
        <SectionHead
          id="blog-index"
          title={filtered ? (result.total === 1 ? "1 post" : `${result.total} posts`) : "Tool profiles"}
          intro={filtered ? undefined : "One page per tool: what it does, how it is priced, what the source says it is good and bad at, and when we read it."}
        />
        {result.items.length > 0 ? (
          <>
            <StoryGrid posts={result.items} />
            <Pagination page={result.page} totalPages={result.totalPages} href={(n) => withQuery("/blog/", { ...q, page: n })} />
          </>
        ) : (
          <EmptyState
            title={filtered ? "No posts match" : "No posts yet"}
            actions={
              <Link className="btn btn-primary" href={filtered ? "/blog/" : "/tools/"}>
                {filtered ? "Show all posts" : "Explore AI tools"}
              </Link>
            }
          >
            {filtered ? "Try another word, or remove a filter." : "Posts appear here once they are published."}
          </EmptyState>
        )}
      </section>

      <MakerStrip />
      {/* The Blog stays editorial: cards link to each deal page, without a code or an outbound button. */}
      <FeaturedDeals className="section" deals={featured} id="page-featured" editorial />
    </div>
  );
}
