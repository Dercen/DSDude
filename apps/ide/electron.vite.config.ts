// electron-vite 5 config for the DSDude IDE (PLAN.md 2.5, docs/kickoff/ws6.md section 9).
// apps/ide/package.json has no "type": "module", so main and preload build as CJS. electron-vite externalises only
// `dependencies`; the @dsdude/* workspace packages are devDependencies and therefore always bundled.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "electron-vite";

/** Per-worktree dev-server port (CLAUDE.md stream table); Playwright and browser tests use base+1..base+9. */
const port = Number(process.env.DSDUDE_PORT_BASE ?? 5160);
const root = import.meta.dirname;
const packagesDir = resolve(root, "../../packages");

/**
 * Workspace sources locate repo files relative to themselves (`new URL("../../../fixtures/...", import.meta.url)`,
 * e.g. @dsdude/toolchain's fixture and screenshot paths). In a CJS bundle `import.meta.url` would be the bundle's
 * URL, so it is pinned to the source file's URL. Only development and test builds use those paths; the packaged app
 * gets its tools from resources/ (WS8).
 */
function sourceImportMetaUrl(): Plugin {
  return {
    name: "dsdude:source-import-meta-url",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!file.startsWith(packagesDir.replace(/\\/g, "/")) && !file.startsWith(packagesDir)) return null;
      if (!code.includes("import.meta.url")) return null;
      return { code: code.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(file).href)), map: null };
    },
  };
}

export default defineConfig({
  main: {
    plugins: [sourceImportMetaUrl()],
    build: {
      // chokidar 5 is ESM-only and zod is shared with the contract schemas: bundle both into the CJS main bundle.
      externalizeDeps: { exclude: ["chokidar", "zod"] },
      rollupOptions: {
        // The utilityProcess build worker is a second main-process entry (PLAN.md 3.2 step 2).
        input: { index: resolve(root, "src/main/index.ts"), "build-worker": resolve(root, "src/worker/index.ts") },
      },
    },
  },
  preload: {
    // A sandboxed preload's require reaches only electron, events, timers and url: one self-contained CJS file.
    build: { externalizeDeps: false },
  },
  renderer: {
    plugins: [react()],
    server: { port, strictPort: true },
  },
});
