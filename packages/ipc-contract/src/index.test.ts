import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, createLocalBridge, invokeChannels, packageName } from "./index.ts";

describe("@dsdude/ipc-contract", () => {
  it("exports the contract and its helpers", () => {
    expect(packageName).toBe("@dsdude/ipc-contract");
    expect(CONTRACT_VERSION).toBe("0.10.0");
    expect(typeof createLocalBridge).toBe("function");
    expect(Object.keys(invokeChannels)).toContain("build.play");
  });
});
