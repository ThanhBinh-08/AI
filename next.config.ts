import path from "node:path";
import type { NextConfig } from "next";

// Sent with every response. The CSP blocks framing, plugins, a foreign <base> and form posts to other
// origins. Scripts are not restricted here: a strict script policy needs per-request nonces, which would
// make every cached page dynamic.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // A second dev server (npm run dev:preview) uses its own build folder so it never touches the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A lockfile in a parent folder must not be taken as the workspace root.
  turbopack: { root: path.resolve(".") },
  reactStrictMode: true,
  poweredByHeader: false,
  // One URL per page: /deals/ (with slash). Requests without the slash get a 308 to it.
  trailingSlash: true,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The hero video and posters never change under the same name.
      { source: "/media/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
