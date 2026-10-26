import type { Metadata } from "next";
import { FeaturedDeals } from "@/components/deals/FeaturedDeals";
import Link from "next/link";
import { BrandTile } from "@/components/cards/cards";
import { EmptyState, PageHead } from "@/components/ui/bits";
import { listBrands, listFeaturedDeals } from "@/data/repository";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMeta({
  title: "Brands",
  description: "Every AI and software brand in the directory, with its active deals and tools.",
  path: "/brands/",
});

export default async function BrandsPage() {
  const featured = await listFeaturedDeals();
  const brands = await listBrands();
  return (
    <div className="container">
      <PageHead
        crumbs={[{ name: "Home", path: "/" }, { name: "Brands", path: "/brands/" }]}
        title="Brands"
        lede="Software companies with tools or deals listed here, in alphabetical order."
      />
      {brands.length > 0 ? (
        <ul className="tiles">
          {brands.map((b) => (
            <BrandTile key={b.id} brand={b} deals={b.activeDeals} tools={b.tools} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No brands yet" actions={<Link className="btn btn-primary" href="/blog/">Read the guides</Link>}>
          Brands appear here once they are reviewed and published.
        </EmptyState>
      )}
      <FeaturedDeals className="section" deals={featured} id="page-featured" />
    </div>
  );
}
