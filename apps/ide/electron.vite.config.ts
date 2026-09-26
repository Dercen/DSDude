// electron-vite 5 config for the DSDude IDE (PLAN.md 2.5, docs/kickoff/ws6.md section 9).
// apps/ide/package.json has no "type": "module", so main and preload build as CJS. electron-vite externalises only
// `dependencies`; the @dsdude/* workspace packages are devDependencies and therefore always bundled.
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

/** Per-worktree dev-server port (CLAUDE.md stream table); Playwright and browser tests use base+1..base+9. */
const port = Number(process.env.DSDUDE_PORT_BASE ?? 5160);

export default defineConfig({
  main: {
    // chokidar 5 is ESM-only and zod is shared with the contract schemas: bundle both into the CJS main bundle.
    build: { externalizeDeps: { exclude: ["chokidar", "zod"] } },
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
