import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";
import { SiteFrame } from "@/components/layout/SiteFrame";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

/** Unknown URLs outside the (site) group: needs its own frame (header and backdrop). Status 404. */
export default function NotFound() {
  return (
    <SiteFrame>
      <NotFoundContent />
    </SiteFrame>
  );
}
