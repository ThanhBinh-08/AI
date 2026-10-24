import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorPanel, FactSheet, kindLabel, MakerStrip, StoryGrid } from "@/components/blog/blog";
import { ReadingProgress } from "@/components/blog/ReadingProgress";
import { CopyLink } from "@/components/blog/CopyLink";
import { DealMentions, ToolTile } from "@/components/cards/cards";
import { BrandLogo, Breadcrumbs, JsonLd } from "@/components/ui/bits";
import { getBlogPost } from "@/data/repository";
import { formatDay } from "@/lib/dates";
import { getSiteUrl } from "@/lib/env";
import { article, breadcrumbs } from "@/lib/jsonld";
import { headingsOf, Markdown, type Heading } from "@/lib/markdown";
import { pageMeta } from "@/lib/seo";
import { coverVars, toneOf } from "@/lib/tone";
import type { PostView } from "@/types/catalog";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getBlogPost((await params).slug);
  if (!data) return { title: "Article not found", robots: { index: false } };
  const { post } = data;
  return pageMeta({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    path: `/blog/${post.slug}/`,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    // Directory profiles, sample posts and thin drafts stay out of search results.
    noindex: !post.indexable,
    image: post.tool?.logoUrl ?? null,
  });
}

/** H2s with their H3s nested, for the table of contents. */
function tocTree(headings: Heading[]): { h: Heading; children: Heading[] }[] {
  const out: { h: Heading; children: Heading[] }[] = [];
  for (const h of headings) {
    if (h.level === 2) out.push({ h, children: [] });
    else out.at(-1)?.children.push(h);
  }
  return out;
}

/** What the post is based on and what it does not cover, written from the data we really have. */
function SourcesAndLimits({ post }: { post: PostView }) {
  const checked = post.updatedAt ?? post.publishedAt;
  const source = post.tool?.listingSource ?? null;
  return (
    <section className="blog-block" aria-labelledby="post-sources">
      <h2 className="subhead-s" id="post-sources">
        Sources and limits
      </h2>
      <ul className="list-plain">
        {post.tool && source ? (
          <li>
            Tool facts come from the{" "}
            {source.url ? (
              <a className="text-link" href={source.url} rel="nofollow noopener noreferrer" target="_blank">
                {source.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              source.name
            )}{" "}
            listing{checked ? `, as of ${formatDay(checked)}` : ""}.
          </li>
        ) : null}
        {post.directoryProfile ? (
          <li>
            This is a tool profile compiled from public listing data, not a review: we have not tested {post.tool?.name ?? "the tool"} ourselves, and
            features, prices and limits may have changed since.
          </li>
        ) : post.tool && !post.tool.verified ? (
          <li>The {post.tool.name} record in our directory has not been checked yet; confirm details on the official site.</li>
        ) : null}
        {checked ? <li>Last updated {formatDay(checked)}. Prices and offers change; confirm them at checkout.</li> : null}
        <li>
          <Link href="/how-we-review/">How we check tools and deals</Link> · <Link href="/contact/">Report a mistake</Link>
        </li>
      </ul>
    </section>
  );
}

export default async function PostPage({ params }: Props) {
  const data = await getBlogPost((await params).slug);
  if (!data) notFound();
  const { post, tool, deals, related } = data;
  const path = `/blog/${post.slug}/`;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog/" },
    { name: post.title, path },
  ];
  const toc = tocTree(headingsOf(post.body));
  const site = getSiteUrl();
  // The page itself links deals and tools only internally; the disclosure shows when the article links a partner.
  const commercial = /\]\(\/go\//.test(post.body);

  return (
    <div className="container">
      <JsonLd data={breadcrumbs(site, crumbs)} />
      <JsonLd data={article(site, post, path, { image: post.tool?.logoUrl })} />

      <ReadingProgress targetId="post-body" />
      <Breadcrumbs items={crumbs} />
      <header className="post-hero" style={coverVars(post.slug, toneOf(post))}>
        <span className="cover-glow" aria-hidden="true" />
        <p className="post-kind">
          {post.tool ? (
            <Link href={`/tools/${post.tool.slug}/`} className="post-tool" aria-label={`${post.tool.name} tool page`}>
              <BrandLogo name={post.tool.name} src={post.tool.logoUrl} size="sm" />
            </Link>
          ) : null}
          <span>{kindLabel(post)}</span>
        </p>
        <h1 className="display">{post.title}</h1>
        {post.excerpt ? <p className="lede">{post.excerpt}</p> : null}
        <div className="byline">
          {post.author ? (
            <span>
              By <Link href="/about/">{post.author}</Link>
            </span>
          ) : null}
          {post.publishedAt ? (
            <span>
              Published <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time>
            </span>
          ) : null}
          {post.updatedAt && post.updatedAt !== post.publishedAt ? (
            <span>
              Updated <time dateTime={post.updatedAt}>{formatDay(post.updatedAt)}</time>
            </span>
          ) : null}
          <span>{post.readingMinutes} min read</span>
          <CopyLink href={`${site}${path}`} />
        </div>
      </header>

      {commercial ? (
        <p className="notice" style={{ marginTop: 20 }}>
          This article contains affiliate links: we may earn a commission at no extra cost to you.{" "}
          <Link href="/affiliate-disclosure/">Affiliate disclosure</Link>
        </p>
      ) : null}

      <div className="post-layout">
        <aside className="post-rail">
          <FactSheet post={post} dealCount={deals.length} />
          {toc.length >= 2 ? (
            <nav className="toc" aria-label="On this page">
              <h2>On this page</h2>
              <ol>
                {toc.map(({ h, children }) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`}>{h.text}</a>
                    {children.length > 0 ? (
                      <ol>
                        {children.map((c) => (
                          <li key={c.id}>
                            <a href={`#${c.id}`}>{c.text}</a>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </aside>

        <article className="prose post-body" id="post-body">
          <Markdown source={post.body} />
        </article>
      </div>

      <SourcesAndLimits post={post} />

      {tool || deals.length > 0 ? (
        <section className="blog-block" aria-labelledby="post-next">
          <h2 className="subhead-s" id="post-next">
            {tool ? `${tool.name} in the directory` : "Related deals"}
          </h2>
          <div className="next-steps">
            {tool ? (
              <ul className="tiles">
                <ToolTile tool={tool} />
              </ul>
            ) : null}
            {/* Articles name deals but never show codes: the code and the Copy button live on the deal page. */}
            {deals.length > 0 ? <DealMentions deals={deals} /> : null}
          </div>
        </section>
      ) : null}

      <AuthorPanel />

      {related.length > 0 ? (
        <section className="blog-block" aria-labelledby="post-related">
          <h2 className="display" id="post-related" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
            Related articles
          </h2>
          <StoryGrid posts={related} />
          <p style={{ marginTop: 20 }}>
            <Link className="text-link" href="/blog/">
              All posts
            </Link>
          </p>
        </section>
      ) : null}

      <MakerStrip />
    </div>
  );
}
