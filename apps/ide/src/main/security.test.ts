import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CSP, isDockviewPopout, isTrustedRendererUrl } from "./security.ts";

const dev = "http://localhost:5160/";

describe("renderer security", () => {
  it("index.html carries the same CSP as main (PLAN.md 2.5)", () => {
    const html = readFileSync(new URL("../renderer/index.html", import.meta.url), "utf8");
    expect(html).toContain(`content="${CSP}"`);
    expect(CSP).not.toContain("unsafe-eval");
  });

  it("trusts only app://ide, the dev server and file://", () => {
    expect(isTrustedRendererUrl("app://ide/index.html", undefined)).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5160/index.html", dev)).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5160/index.html", undefined)).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:5161/", dev)).toBe(false);
    expect(isTrustedRendererUrl("https://example.com/", dev)).toBe(false);
    expect(isTrustedRendererUrl("app://evil/index.html", undefined)).toBe(false);
    expect(isTrustedRendererUrl("garbage", dev)).toBe(false);
  });

  it("allows window.open only for dockview popouts", () => {
    expect(isDockviewPopout("app://ide/popout.html", undefined)).toBe(true);
    expect(isDockviewPopout("http://localhost:5160/popout.html", dev)).toBe(true);
    expect(isDockviewPopout("app://ide/index.html", undefined)).toBe(false);
    expect(isDockviewPopout("https://example.com/popout.html", dev)).toBe(false);
  });
});
