import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/*",
      "tools/gen-docs",
      "runtime",
      { test: { name: "tools", include: ["tools/*.test.ts", "tools/phase0/**/*.test.ts"] } },
    ],
  },
});
