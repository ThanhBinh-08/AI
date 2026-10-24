import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));
const stub = fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": src, "server-only": stub } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
