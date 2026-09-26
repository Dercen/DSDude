// Root postinstall (PLAN.md 2.5): Electron 42+ has no postinstall of its own, so fetch its binary here.
// Cloud clones set DSDUDE_SKIP_ELECTRON=1 and never run Electron. Plain JS: Node runs it before any TS tooling.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

if (process.env.DSDUDE_SKIP_ELECTRON === "1") {
  console.log("postinstall: DSDUDE_SKIP_ELECTRON=1, skipping install-electron");
  process.exit(0);
}
const ide = resolve(import.meta.dirname, "../apps/ide/package.json");
if (!existsSync(ide)) process.exit(0);
let script;
try {
  script = createRequire(ide).resolve("electron/install.js");
} catch {
  console.error("postinstall: electron is not installed; run npm install again");
  process.exit(1);
}
const r = spawnSync(process.execPath, [script], { stdio: "inherit", timeout: 600_000 });
if (r.error) console.error(`postinstall: install-electron failed: ${r.error.message}`);
process.exit(r.status ?? 1);
