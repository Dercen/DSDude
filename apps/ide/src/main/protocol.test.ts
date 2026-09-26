import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppUrl } from "./protocol.ts";

const root = join("C:", "app", "out", "renderer");

describe("resolveAppUrl", () => {
  it("maps app://ide paths into the renderer directory", () => {
    expect(resolveAppUrl(root, "app://ide/index.html")).toBe(join(root, "index.html"));
    expect(resolveAppUrl(root, "app://ide/")).toBe(join(root, "index.html"));
    expect(resolveAppUrl(root, "app://ide/assets/editor.worker-x.js?worker_file&type=module")).toBe(
      join(root, "assets", "editor.worker-x.js"),
    );
    expect(resolveAppUrl(root, "app://ide/assets/a%20b.css")).toBe(join(root, "assets", "a b.css"));
  });

  it("refuses foreign hosts, schemes and traversal", () => {
    expect(resolveAppUrl(root, "app://other/index.html")).toBeNull();
    expect(resolveAppUrl(root, "https://ide/index.html")).toBeNull();
    // The URL parser folds `..` and `%2e%2e` at the root, so these stay inside the renderer directory.
    expect(resolveAppUrl(root, "app://ide/../main/index.js")).toBe(join(root, "main", "index.js"));
    expect(resolveAppUrl(root, "app://ide/%2e%2e/main/index.js")).toBe(join(root, "main", "index.js"));
    expect(resolveAppUrl(root, "app://ide/..%5cmain%5cindex.js")).toBeNull();
    expect(resolveAppUrl(root, "app://ide/%E0%A4%A")).toBeNull();
    expect(resolveAppUrl(root, "not a url")).toBeNull();
  });
});
