# Mock host (C12)

The IDE's renderer services without Electron, for headless Chromium. WS6b mounts its editors here and WS7 checks
its Learn content here, in cloud sessions (`DSDUDE_SKIP_ELECTRON=1`) as well as locally. Owner: WS6. The API froze at
CP-A together with `apps/ide/src/renderer/panels/api.ts` (`@dsdude/ide/panels`).

- **Implementation:** `apps/ide/src/renderer/mock-host/`, exported as `@dsdude/ide/mock-host`. This folder
  re-exports it (`index.ts`), so the contract path named in PLAN.md 5.2 C12 works too.
- **What it runs:** a sample project (default `samples/flappy`, loaded through C1 `load`), its asset files, settings,
  the repo's `docs/tutorial|manual|reference`, and a fake build and emulator that print `DSD|READY` and `DSD|LOG|hello`.
  All of it sits in memory behind `createLocalBridge`, so every request and response passes the same C5 zod checks
  as in the IDE.
- **Where it runs:** Vitest browser mode (`@vitest/browser-playwright`, headless Chromium, port base+1). The `apps/ide`
  browser project is `apps/ide/vitest.browser.config.ts`; it picks up `src/**/*.browser.test.{ts,tsx}`, including
  WS6b's `src/renderer/editors/**`. Install the browser once with `npx playwright install chromium`, then run
  `npm run test:browser -w apps/ide` (`npm test -w apps/ide` runs the node tests, then this).

## API

```ts
import { createMockHost } from "@dsdude/ide/mock-host";

const host = await createMockHost({ project: "flappy" }); // or a Project, or null
host.ide.store.getState().project;                          // the C1 Project the views see

// An editor (C12 EditorPanelFactory). The panel gets a PanelHost: project store, files, ipc, undo, toast, Learn.
const m = await host.mountEditor(spriteEditor, { kind: "sprite", name: "spr_bird" });
m.element;             // the 1024x720 element it rendered into
m.host.undo.undo();    // its undo stack
await host.ide.actions.save(); // saves dirty panels (panel.save), then the project (project.save)
host.files;            // asset files written through project.writeFile
host.saved;            // every project.save

await host.mountLearn({ path: "docs/tutorial/flappy-bird.md", anchor: "the-bird" });
await host.mountShell(); // the whole IDE UI (once per page)
host.calls;              // every C5 invoke; host.layout: what views asked the layout to open
host.dispose();
```

Options: `settings`, `buildDiagnostics` (an error makes Play fail), `emulatorLines`, `docs` (extra markdown by
path), and `handlers` (replace or add C5 handlers, e.g. `assets.preview` with WS5's `previewSprite` until main wires
it). `apps/ide/src/renderer/mock-host/mock-host.browser.test.tsx` is a working example of each call.

## Screenshots

`import { page } from "vitest/browser"` and `await page.screenshot({ path })`, then read the PNG with the image-capable
Read tool (paths are relative to the test file; write under `apps/ide/test-results/`, which git ignores).
