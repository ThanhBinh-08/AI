// Reads the live Google Sheet once (read-only) and prints what the site would publish and every issue found.
// Usage: npm run check:sheet   (uses .env.local)
import { parseCatalog } from "@/data/schemas/parse";
import { GoogleSheetsSource } from "@/data/sheets/google-source";
import { hasGoogleEnv } from "@/lib/env";

if (!hasGoogleEnv()) {
  console.error("GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set (see .env.example).");
  process.exit(1);
}

const tabs = await new GoogleSheetsSource().fetchTabs();
const { catalog, affiliateUrls } = parseCatalog(tabs);
const published = catalog.brands.filter((b) => b.status === "published");
console.log(`Rows read: Brands ${Math.max(0, tabs.Brands.length - 1)}, Coupons ${Math.max(0, tabs.Coupons.length - 1)}, Products ${Math.max(0, tabs.Products.length - 1)}, Content ${Math.max(0, tabs.Content.length - 1)}`);
console.log(`Published brands: ${published.length} (with a working /go/ link: ${published.filter((b) => b.hasAffiliate).length})`);
console.log(`Valid affiliate URLs: ${affiliateUrls.size}`);
console.log(`Coupons kept: ${catalog.coupons.length}; tools: ${catalog.products.length}; posts: ${catalog.posts.length}`);
if (catalog.issues.length === 0) console.log("No issues.");
for (const i of catalog.issues) console.log(`- ${i.tab} row ${i.row}: ${i.message}`);
