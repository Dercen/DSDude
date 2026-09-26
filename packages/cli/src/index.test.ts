import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@dsdude/cli skeleton", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@dsdude/cli");
  });
});
