import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Mirrors next.config.ts (trailingSlash: true), which next/link reads from this variable.
process.env.__NEXT_TRAILING_SLASH = "true";

afterEach(() => cleanup());
