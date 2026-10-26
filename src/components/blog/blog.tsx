import Link from "next/link";
import { categoryBySlug } from "@/config/categories";
import { AUTHOR, SITE, SITE_LOGO } from "@/config/site";
import { formatDay } from "@/lib/dates";
import { coverVars, toneOf } from "@/lib/tone";
import { BrandLogo } from "@/components/ui/bits";
import type { BlogKind, PostView } from "@/types/catalog";

export const KIND_LABEL: Record<BlogKind, string> = { review: "Review", guide: "Guide", comparison: "Comparison" };

/** A review built from directory data about an unchecked tool is a "Tool profile", never a "Review". */
export const kindLabel = (p: PostView) => (p.directoryProfile ? "Tool profile" : KIND_LABEL[p.kind]);
export const KIND_PLURAL: Record<BlogKind, string> = { review: "Reviews and profiles", guide: "Guides", comparison: "Comparisons" };

const minutes = (p: PostView) => `${p.readingMinutes} min read`;

/** What sits in the middle of a cover: the tool's logo (from its tool_id); without one, the site's own logo. */
function Mark({ post }: { post: PostView }) {
  if (post.tool?.logoUrl) return <BrandLogo name={post.tool.name} src={post.tool.logoUrl} size="lg" />;
  return <BrandLogo name={SITE.name} src={SITE_LOGO} size="lg" />;
}

/**
 * A cover drawn in CSS: a glow seen through a grid of dots, like the LED panel of the home hero.
 * Colours follow the category, the glow position follows the slug, so no two covers match and none needs an image.
 */
export function Cover({ post, large }: { post: PostView; large?: boolean }) {
  const category = post.categories[0] ? categoryBySlug(post.categories[0])?.name : null;
  return (
    <div className={`cover${large ? " large" : ""}`} style={coverVars(post.slug, toneOf(post))} aria-hidden="true">
      <span className="cover-glow" />
      <span className="cover-mark">
        <Mark post={post} />
      </span>
      <span className="cover-foot">
        <span>{category ?? kindLabel(post)}</span>
        <span>{minutes(post)}</span>
      </span>
    </div>
  );
}

/** One post as a card: cover, title, excerpt. The whole card is the link. */
export function StoryCard({ post }: { post: PostView }) {
  return (
    <li className="story">
      <Cover post={post} />
      <div className="story-body">
        <p className="post-meta">
          <span>{kindLabel(post)}</span>
          {post.publishedAt ? <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time> : null}
        </p>
        <h3>
          <Link href={`/blog/${post.slug}/`}>{post.title}</Link>
        </h3>
        {post.excerpt ? <p className="story-excerpt">{post.excerpt}</p> : null}
      </div>
    </li>
  );
}

export function StoryGrid({ posts }: { posts: PostView[] }) {
  return (
    <ul className="story-grid">
      {posts.map((p) => (
        <StoryCard key={p.id} post={p} />
      ))}
    </ul>
  );
}

/** The lead story of the Blog home: a large cover beside the headline. */
export function Feature({ post }: { post: PostView }) {
  return (
    <article className="feature">
      <Link href={`/blog/${post.slug}/`} tabIndex={-1} aria-hidden="true" className="feature-cover">
        <Cover post={post} large />
      </Link>
      <div className="feature-body">
        <p className="post-meta">
          <span>{kindLabel(post)}</span>
          {post.publishedAt ? <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time> : null}
          <span>{minutes(post)}</span>
        </p>
        <h2>
          <Link href={`/blog/${post.slug}/`}>{post.title}</Link>
        </h2>
        {post.excerpt ? <p className="feature-excerpt">{post.excerpt}</p> : null}
        <Link className="btn btn-primary" href={`/blog/${post.slug}/`}>
          {post.kind === "guide" ? "Read the guide" : post.kind === "comparison" ? "Read the comparison" : post.directoryProfile ? "Read the profile" : "Read the review"}
        </Link>
      </div>
    </article>
  );
}

/**
 * Spec sheet beside the article: what the post is about, in rows with dotted leaders.
 * Only rows with a real value are drawn.
 */
export function FactSheet({ post, dealCount }: { post: PostView; dealCount: number }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Type", value: kindLabel(post) },
    ...(post.tool ? [{ label: "About", value: <Link href={`/tools/${post.tool.slug}/`}>{post.tool.name}</Link> }] : []),
    ...(post.categories.length > 0
      ? [{ label: "Category", value: <Link href={`/blog/?category=${post.categories[0]}`}>{categoryBySlug(post.categories[0]!)?.name}</Link> }]
      : []),
    ...(post.tool ? [{ label: "Active deals", value: dealCount > 0 ? <Link href="/deals/">{dealCount}</Link> : "None listed" }] : []),
    ...(post.updatedAt || post.publishedAt ? [{ label: "Updated", value: <time dateTime={(post.updatedAt ?? post.publishedAt)!}>{formatDay((post.updatedAt ?? post.publishedAt)!)}</time> }] : []),
    { label: "Reading time", value: `${post.readingMinutes} min` },
  ];
  return (
    <dl className="spec" aria-label="About this post">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <span className="leader" aria-hidden="true" />
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Byline panel. By default the site is the author; see AUTHOR in src/config/site.ts to change it. */
export function AuthorPanel() {
  return (
    <aside className="author-panel" aria-label="About the author">
      <span className="author-mark" aria-hidden="true">
        {AUTHOR.name.slice(0, 2)}
      </span>
      <div>
        <h2>{AUTHOR.name}</h2>
        <p className="author-role">{AUTHOR.role}</p>
        <p>{AUTHOR.bio}</p>
        <p className="author-links">
          <Link className="text-link" href="/about/">
            About us
          </Link>
          <Link className="text-link" href="/how-we-review/">
            How we check things
          </Link>
          <Link className="text-link" href="/contact/">
            Contact us
          </Link>
        </p>
      </div>
    </aside>
  );
}

/** For the people who make the tools: a real way to fix or add a listing. */
export function MakerStrip() {
  return (
    <section className="maker-strip" aria-labelledby="maker-title">
      <div>
        <h2 id="maker-title">Make an AI tool?</h2>
        <p>If something about your tool is out of date or wrong, tell us and we will check it against your site. You can also ask to be listed.</p>
      </div>
      <Link className="btn btn-primary" href="/contact/">
        Send a correction
      </Link>
    </section>
  );
}
