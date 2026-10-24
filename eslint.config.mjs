import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Pages and components read data only through the repository, never the Sheets client or row schemas.
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/data/sheets", "@/data/sheets/*", "@/data/schemas", "@/data/schemas/*", "google-auth-library"],
              message: "Use @/data/repository; never import the Sheets client or row schemas here.",
            },
          ],
        },
      ],
    },
  },
  {
    // Components receive typed props; only app/ pulls data.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/data/*", "google-auth-library"], message: "Components must not import the data layer." }] },
      ],
    },
  },
  globalIgnores([".next/**", ".next-preview/**", ".next-build/**", "local-data/**", "out/**", "legacy/**", "next-env.d.ts", "node_modules/**", "public/**"]),
]);
