import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.ts";
import { readRepoFile } from "./testing/golden.ts";

describe("LIMITS", () => {
  it("matches contracts/runtime-limits.json (C13), the single source", () => {
    const c13 = JSON.parse(new TextDecoder().decode(readRepoFile("contracts/runtime-limits.json"))) as {
      limits: Record<string, number>;
    };
    for (const [key, value] of Object.entries(LIMITS)) expect([key, c13.limits[key]]).toEqual([key, value]);
  });
});
