import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@dsdude/toolchain skeleton", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@dsdude/toolchain");
  });
});
