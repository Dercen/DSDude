import { defineProject } from "vitest/config";

// Node unit tests only; tests/*.spec.ts is the Playwright `_electron` suite (`npm run test:e2e -w apps/ide`).
export default defineProject({ test: { name: "ide", include: ["src/**/*.test.{ts,tsx}"] } });
