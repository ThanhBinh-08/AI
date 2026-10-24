// Suggests brand name, slug and domain for an affiliate URL. Nothing is written anywhere: copy the result
// into the Brands tab after checking it, and publish the brand yourself.
// Usage: npm run detect:brand -- "<affiliate url>" [--follow]
//   --follow  also follows the link's redirects (HEAD only, max 5, 5 s each, public addresses only).
import { suggestBrand } from "@/lib/brand-detect";
import { followRedirects } from "@/lib/net-guard";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
if (!url) {
  console.error('Usage: npm run detect:brand -- "<affiliate url>" [--follow]');
  process.exit(1);
}

let hosts: string[] = [];
if (args.includes("--follow")) {
  try {
    const hops = await followRedirects(url);
    hosts = hops.map((h) => new URL(h.url).hostname);
    console.log("Redirect chain:");
    for (const h of hops) console.log(`  ${h.status} ${h.url}`);
  } catch (err) {
    console.error(`Redirects not followed: ${err instanceof Error ? err.message : err}`);
  }
}

try {
  console.log(JSON.stringify(suggestBrand(url, hosts), null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
