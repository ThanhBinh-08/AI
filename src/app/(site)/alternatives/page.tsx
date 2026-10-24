import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/bits";
import { listAlternatives } from "@/data/repository";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const items = await listAlternatives();
  return pageMeta({
    title: "Alternatives to popular AI tools",
    description: "Other tools that do the same job, with the criteria used to pick them, checked prices and active deals.",
    path: "/alternatives/",
    noindex: items.length === 0,
  });
}

export default async function AlternativesIndex() {
  const items = await listAlternatives();
  return (
    <div className="container">
      <PageHead
        crumbs={[{ name: "Home", path: "/" }, { name: "Alternatives", path: "/alternatives/" }]}
        title="Alternatives"
        lede="Each page explains why the alternatives were chosen and compares them on checked facts."
      />
      {items.length > 0 ? (
        <ul className="tiles">
          {items.map((p) => (
            <li key={p.id}>
              <article className="tile">
                <h3>
                  <Link href={`/alternatives/${p.slug}/`}>{p.title}</Link>
                </h3>
                {p.excerpt ? <p>{p.excerpt}</p> : null}
                <div className="tile-foot">
                  <span>Instead of {p.subject}</span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No alternatives pages yet" actions={<Link className="btn btn-primary" href="/tools/">Explore AI tools</Link>}>
          These pages are written once a tool and at least one alternative have been reviewed.
        </EmptyState>
      )}
    </div>
  );
}
