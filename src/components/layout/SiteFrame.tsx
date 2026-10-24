import type { ReactNode } from "react";
import { SITE } from "@/config/site";
import { Header } from "@/components/layout/Header";

/** Every page except Home: the hero light as a dim backdrop, the pill header, then the content. */
export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <div className="backdrop" aria-hidden="true" />
      <div className="page-top">
        <Header siteName={SITE.name} />
      </div>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
