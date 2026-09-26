import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@dsdude/project-format skeleton", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@dsdude/project-format");
  });
});
