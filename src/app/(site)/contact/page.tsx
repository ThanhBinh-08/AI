import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact/ContactForm";
import { JsonLd, PageHead } from "@/components/ui/bits";
import { contactEmail, contactWebhook } from "@/lib/contact";
import { getSiteUrl } from "@/lib/env";
import { breadcrumbs } from "@/lib/jsonld";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Contact us",
  description: "Report a code that does not work, information that is out of date, or anything else about the site.",
  path: "/contact/",
});

export default function ContactPage() {
  const email = contactEmail();
  const formEnabled = contactWebhook() !== null;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Contact us", path: "/contact/" },
  ];
  return (
    <div className="container">
      <JsonLd data={breadcrumbs(getSiteUrl(), crumbs)} />
      <PageHead
        crumbs={crumbs}
        title="Contact us"
        lede="Tell us about a code that no longer works, a price or feature that changed, or anything else on the site."
      />
      <div className="detail">
        <div>
          {formEnabled ? (
            <ContactForm />
          ) : (
            <div className="state">
              <p className="display">The contact form is not available</p>
              <p>{email ? "Write to us by email instead." : "Please check back soon."}</p>
            </div>
          )}
        </div>
        <aside className="aside">
          {email ? (
            <div className="panel">
              <h2 className="subhead-s">Email</h2>
              <p>
                <a href={`mailto:${email}`}>{email}</a>
              </p>
            </div>
          ) : null}
          <p className="notice">
            Reporting a deal? Include the brand and the code. Brands set their own prices and terms, so for billing or account questions
            contact the brand directly. Read <Link href="/how-we-review/">how we check deals</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
