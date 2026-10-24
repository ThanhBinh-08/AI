import { SiteFrame } from "@/components/layout/SiteFrame";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
