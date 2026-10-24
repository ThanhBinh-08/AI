import type { Metadata } from "next";
import Link from "next/link";
import { PostTile } from "@/components/cards/cards";
import { EmptyState, PageHead } from "@/components/ui/bits";
import { listComparisons } from "@/data/repository";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const items = await listComparisons();
  return pageMeta({
    title: "AI tool comparisons",
    description: "Side-by-side comparisons of AI tools: features, checked prices, strengths, limitations and active deals.",
    path: "/compare/",
    // An empty index page has nothing to offer a search engine.
    noindex: items.length === 0,
  });
}

export default async function ComparePage() {
  const items = await listComparisons();
  return (
    <div className="container">
      <PageHead
        crumbs={[{ name: "Home", path: "/" }, { name: "Compare", path: "/compare/" }]}
        title="Comparisons"
        lede="Side-by-side facts from our directory. We do not score or rank tools; each comparison says what was checked and when."
      />
      {items.length > 0 ? (
        <ul className="tiles">
          {items.map((p) => (
            <PostTile key={p.id} post={p} base="/compare/" />
          ))}
        </ul>
      ) : (
        <EmptyState title="No comparisons yet" actions={<Link className="btn btn-primary" href="/tools/">Explore AI tools</Link>}>
          Comparisons are published once at least two of the tools have been reviewed.
        </EmptyState>
      )}
    </div>
  );
}
