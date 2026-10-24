import { describe, expect, it } from "vitest";
import { getGoogleEnv } from "@/lib/env";

// A backslash followed by "n", as the key is written in .env files.
const ESCAPED_NEWLINE = String.fromCharCode(92) + "n";

describe("getGoogleEnv", () => {
  it("turns escaped newlines in the private key into real ones and trims values", () => {
    const env = getGoogleEnv({
      GOOGLE_SHEET_ID: " abc ",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "x@y.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: ["-----BEGIN PRIVATE KEY-----", "AAA", "-----END PRIVATE KEY-----", ""].join(ESCAPED_NEWLINE),
    } as unknown as NodeJS.ProcessEnv);
    expect(env.GOOGLE_SHEET_ID).toBe("abc");
    expect(env.GOOGLE_PRIVATE_KEY).toBe(["-----BEGIN PRIVATE KEY-----", "AAA", "-----END PRIVATE KEY-----", ""].join(String.fromCharCode(10)));
  });
});

describe("previewRecordsAllowed", () => {
  it("never shows preview rows on an indexable production site", async () => {
    const { previewRecordsAllowed } = await import("@/lib/env");
    expect(previewRecordsAllowed({ SHOW_PREVIEW_RECORDS: "1", NEXT_PUBLIC_SITE_URL: "https://www.example.com" } as never)).toBe(false);
    expect(previewRecordsAllowed({ SHOW_PREVIEW_RECORDS: "1", NEXT_PUBLIC_SITE_URL: "http://localhost:3400" } as never)).toBe(true);
    expect(previewRecordsAllowed({ SHOW_PREVIEW_RECORDS: "1", NEXT_PUBLIC_SITE_URL: "https://staging.example.com", NOINDEX: "1" } as never)).toBe(true);
    expect(previewRecordsAllowed({ NEXT_PUBLIC_SITE_URL: "http://localhost:3400" } as never)).toBe(false);
  });
});
