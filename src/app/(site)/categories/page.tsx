import type { Metadata } from "next";
import Link from "next/link";
import { CategoryTile } from "@/components/cards/cards";
import { EmptyState, PageHead } from "@/components/ui/bits";
import { listCategories } from "@/data/repository";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMeta({
  title: "AI tool categories",
  description: "Browse AI tools and software deals by what they do: writing, images, video, coding, audio, productivity and more.",
  path: "/categories/",
});

export default async function CategoriesPage() {
  const categories = await listCategories();
  return (
    <div className="container">
      <PageHead
        crumbs={[{ name: "Home", path: "/" }, { name: "Categories", path: "/categories/" }]}
        title="Categories"
        lede="Only categories with at least one published tool, brand or active deal are shown."
      />
      {categories.length > 0 ? (
        <ul className="tiles">
          {categories.map((c) => (
            <CategoryTile key={c.slug} slug={c.slug} name={c.name} glyph={c.glyph} deals={c.deals} tools={c.tools} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No categories yet" actions={<Link className="btn btn-primary" href="/blog/">Read the guides</Link>}>
          Categories appear as soon as a tool or deal is published in them.
        </EmptyState>
      )}
    </div>
  );
}
