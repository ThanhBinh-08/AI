import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

/** notFound() inside a (site) page: the (site) layout already draws the header and backdrop. Status 404. */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
