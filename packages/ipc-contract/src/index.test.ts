import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@dsdude/ipc-contract skeleton", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@dsdude/ipc-contract");
  });
});
