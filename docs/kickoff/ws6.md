# WS6 kickoff: IDE shell

You build the Electron application the beginner sees: typed IPC, dockview layout, project tree, Monaco host, object editor, Output/Problems/meters, Play/Stop, wizards, the Controls card and the Learn panel host. You own C5 (IPC) and C12 (EditorPanel host API), work against `MockBuildService` until the real `BuildService` is wired, and build the visual editors yourself unless the optional cloud stream WS6b runs. You are a local stream (hybrid mode, slot 3): Electron needs Windows.

## 1. Paste this to start

```text
You are workstream **WS6: IDE shell** on DSDude, a GameMaker-like Nintendo DS IDE. Read `docs/kickoff/ws6.md` first, then your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md` and the contract files listed for you; read the `PLAN.md` sections they cite, not the whole file. Work only inside the paths `tools/ownership.json` assigns to you; WS0's integration refuses anything else. Edit only the contract files `tools/ownership.json` assigns to you (T0/T1 directly, T2 via ADR; section 7.4); never edit root config files or `package-lock.json`; never run `pacman`/`wf-pacman`; put a timeout on every process you spawn. If a contract blocks you, write `docs/adr/NNNN-<title>.md` with a proposed change, mark your workaround `// ADR-pending ADR-NNNN`, and continue. Branch `ws6-ide` in worktree `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6`; merge `main` into your branch daily (never rebase once WS0 has merged any of your commits); small commits; run `npm test -w apps/ide` (or `mingw32-make -f runtime/Makefile.host test` / `make -j4` for the runtime) before each commit. Keep to the capacity rules of section 7.2: `vitest run --pool=threads --maxWorkers=2`, no watch mode, close the dev IDE and the emulator after each test. You cannot see emulator windows: verify with `DSD|` lines and `dsdude screenshot` PNGs. Keep `docs/status/ws6.md` current. Test in isolation using the fixtures and mocks named below; do not wait for other streams. Report blockers as ADR drafts.

Read docs/kickoff/ws6.md, CLAUDE.md, apps/ide/CLAUDE.md and the contracts in its section 4. Operating mode: hybrid, local slot 3 (the CLAUDE.md Status block is authoritative; a recorded fallback mode uses its lines in section 2). Then begin with task 1 of its section 5.
```

## 2. When this stream starts

- **Hybrid mode (the plan):** local slot 3 from the `phase0` tag (D, day 2) to release. WS0 has the user launch you once the tag is on `main` and the memory gate holds (> 1.5 GB available). You are the only Electron stream until CP-C, when WS8 takes slot 1. The C12 panel API and `fixtures/ide/mock-host` freeze at CP-A (D+3); the real `BuildService` is wired at CP-B (D+7) = M0 (week 2), which includes IDE Play. M3 week 6-7, M4 week 8-9, release 0.1 around week 12-14.
- **Cloud streams:** WS2 and WS4 from the tag, WS5 and WS7 from CP-A, optional WS6b from CP-B. WS7 and WS6b build against C12 and the mock host in headless Chromium; WS5 publishes the preview API. Their work reaches you only through `main`, after WS0 integrates their `origin/<push target>` branches.
- **Depends on:** WS0; WS1's BuildService (wired at CP-B); WS5's preview API (via `main`, frozen at CP-B).
- **Fallbacks** (WS0 records a switch in the CLAUDE.md Status block):
  - *Upgraded mode* (after a RAM upgrade): as hybrid, with one emulator per worktree; its calendar is in PLAN section 8.
  - *Standard mode* (GitHub or cloud sessions unavailable for more than a day, every push target refused, or staggering cannot absorb the usage limits): if you have not started yet, slot 3 after WS5 hands off (~week 8), once the pipeline exists; wire the real BuildService on day 1 and build the visual editors yourself. C12 freezes by the late-start rule (section 7.3): the first checkpoint at least three working days after your start. The M0 IDE criterion moves to M3 (week 11-12). If you are already running, WS0 re-plans at the next checkpoint.

## 3. Setup

```powershell
# Run in PowerShell.
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
git worktree add ..\DSDude-ws6 -b ws6-ide
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6
git config --worktree dsdude.ws WS6
npm install          # never npm ci in worktrees
# Per-instance env block (PLAN.md section 7.5). Set in the worktree's PowerShell before starting `claude`.
$env:DSDUDE_HOME = 'C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6\.dsdude'
$env:DSDUDE_PORT_BASE = '5160'   # electron-vite dev server = base; Vitest browser mode / Playwright = base+1..base+9
$env:DSDUDE_MAKE_JOBS = '4'   # hybrid and standard mode always; upgraded mode while more than two stream instances run (buildRuntime default is 8)
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = "C:\msys64\opt\wonderful\bin;$env:PATH;C:\msys64\ucrt64\bin"   # ucrt64\bin last: host gcc and mingw32-make need it (section 2.4); without it gcc exits 1 with no message
claude
```

Give the first `npm install` a 10-minute tool timeout. The root postinstall (`tools/postinstall.mjs`) runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1`, a cloud-only variable: never set it here. Check that `node_modules\electron\path.txt` exists afterwards. If not, run `npx install-electron` with a 10-minute timeout (~100 MB; later worktrees reuse Electron's download cache), and note it in `docs/status/ws6.md`.

## 4. Owned paths and contracts

**Contract versions at the `phase0` tag** (the index with owners and freeze points is `contracts/README.md`; the history is `contracts/CHANGELOG.md`): every Phase-0 contract is **0.1.0** — C1 project format, C2 `dsdb.md` + `opcodes.json` + `builtins.json` (ABI hash `0x0dd9987a`), C4 `api.ts`, C5 `ipc.md` stubs, C6 `language.md` + `events.md`, C8 `log-protocol.md`, C9 `diagnostics.md`, C10 `cli.md` draft, C12 `preview.ts` types, C13 `runtime-limits.json`. Owed, each by its owner: C3 `assetpack.md` (WS5, first day), C4 `toolchain-api.md` (WS1, CP-A), C7 `host.ts` (WS4, CP-B), C8 `runtime-artifact.md` (WS3, first `runtime/dist` build), C11 `dsd_platform.h` (WS2, CP-A), C12 panel API + mock-host (WS6, CP-A).

**You own** (`tools/ownership.json`):
- `apps/ide/**` except `src/renderer/editors/**` and `electron-builder.yml`
- `packages/ipc-contract/**` (from the tag)
- `contracts/ipc.md`
- `fixtures/ide/**` (including mock-host)
- `docs/status/ws6.md`
- When WS6b does not run (an ownership event WS0 records): also `apps/ide/src/renderer/editors/**`, `packages/editor-core/**`, `fixtures/editors/**`

**Not yours:** `apps/ide/electron-builder.yml` (WS8), `packages/monaco-dss/**` (WS7), `packages/toolchain/**` (WS1/WS8), root config and `package-lock.json` (WS0); a new dependency means committing only `apps/ide/package.json`. `.githooks/pre-commit` runs Biome and `tools/check-ownership.ts`; `.githooks/commit-msg` adds `DSDude-WS: WS6` and rejects `package-lock.json`. WS0's integration checks every non-merge commit in `main..ws6-ide` and refuses the merge on one foreign path.

| | Contract | Files |
|---|---|---|
| Own | C5 IPC channel map (owner from the tag; completes the Phase-0 stubs) | `packages/ipc-contract`, `contracts/ipc.md` |
| Own | C12 EditorPanel host API (frozen at CP-A in hybrid and upgraded mode, late-start freeze rule in the standard fallback) | `apps/ide/src/renderer/panels/api.ts`, `fixtures/ide/mock-host` |
| Consume | C4 Toolchain API | `packages/toolchain/src/api.ts`, `MockBuildService`, `BuildService` |
| Consume | C8 Log protocol (Output drops `DSD\|PAD\|`) | `contracts/log-protocol.md` |
| Consume | C9 Diagnostics (Problems with click-to-line) | `contracts/diagnostics.md` |
| Consume | C1 Project format, C13 limits | `packages/project-format`, `contracts/project-format.md`, `contracts/runtime-limits.json` |
| Consume | C12 preview API | `packages/asset-pipeline/src/preview.ts` |

Pin to the versions in `contracts/CHANGELOG.md`; breaking C5/C12 changes need an ADR co-signed by WS1, WS6b, WS7 and WS8. The cloud co-signers (WS7, WS6b) see an ADR only after WS0 merges and pushes `main`, so commit ADRs promptly.

## 5. First tasks (in order; standard-mode fallback: see task 5)

1. **Skeleton + spike 13 (day 1).** electron-vite 5.0.0 in `apps/ide` with CJS main/preload (no `"type": "module"`; bundled `@dsdude/*`, see section 9) and the security settings in section 9 of this file (PLAN.md section 2.5). `app.setPath('userData', path.join(process.env.DSDUDE_HOME, 'userData'))` (not `DSDUDE_HOME` itself, which also holds `emulators\` and `build\`); dev-server port = `DSDUDE_PORT_BASE`. Spike 13: mount Monaco 0.57 via the entry points in PLAN section 2.5 under `sandbox: true` + CSP, in `electron-vite dev` and in the built app (dedicated worker appears, no getWorker warning); render dockview-react; `electron-vite build`, then `_electron.launch`. Standard-mode fallback: WS0 ran the spike in week 1; read `docs/status/ws0.md`. Record results in `docs/status/ws6.md`; a failure is an ADR (fallback pin monaco 0.56.0).
2. **IPC (C5).** In `packages/ipc-contract`: invoke channels `project.open/save/create`, `assets.import/preview`, `build.play/build/compileOnly/cancel`, `emulator.stop/status/install`, `settings.get/set`, `toolchain.status/install`, `doctor.run`; events `build.log/progress/diagnostics`, `emulator.log/exit`, `project.changed`. One zod schema per channel; the preload exposes only `invoke/on` for listed channels; main validates sender and schema. Node Vitest per schema; bump `contracts/ipc.md`.
3. **Store, layout, Play against the mock.** zustand store over `@dsdude/project-format`; open `samples/flappy`. dockview-react (CSS `dockview/dist/styles/dockview.css`): project tree, editor tabs, plain-text Monaco host (until `packages/monaco-dss` lands), Output (C8, `DSD|PAD|` dropped, batched ~30 ms) and Problems (C9, click-to-line). Main hosts EmulatorManager (step 7) and forks one `utilityProcess` build worker for `BuildService` steps 3-6 (PLAN 3.2). Play/Stop via `build.play`/`emulator.stop` against `MockBuildService`.
4. **C12 + mock host + Learn panel host.** `apps/ide/src/renderer/panels/api.ts`: `EditorPanel {id, kind, open(resource), save(), dispose(), onDirty}` plus host services (project store, IPC client, undo stack, toast); `fixtures/ide/mock-host`. Learn panel: renders `docs/tutorial` and `docs/manual` markdown, opens on first launch, target of F1, hover 'Learn more' and Problems code links. The pinned stack has no markdown renderer: add one MIT-licensed renderer plus an HTML sanitiser to `apps/ide/package.json` only (WS0 regenerates the lockfile), render in the renderer with no `unsafe-eval` and no remote images, and record the choice in `docs/status/ws6.md`. Hybrid: commit all three before CP-A (D+3), so WS0's merge puts them on `origin/main` for WS7 and WS6b; the mock host must run in headless Chromium without Electron.
5. **Real BuildService.** Hybrid and upgraded mode: wire it at CP-B. Standard-mode fallback: it exists when you start, so do tasks 2 and 3 against the real `BuildService`, and finish task 4 by the end of your first week, because WS7 waits for it. The build worker injects `compileProject`, `packAssets` and `checkRoomBudgets` into it (C4). Put `MockBuildService`/`createFakeToolchain()` behind a fake-toolchain switch (`DSDUDE_FAKE_TOOLCHAIN=1`) for Vitest and Playwright.
6. **Then:** object editor (event files stacked in one scrollable panel, one Monaco model each, event list as jump bar, 'Functions' pseudo-event creates `functions.dss`); import dialogs over `previewSprite(png, opts)`; plain-language meters from C13 + `assets.manifest.json` (Sound memory; red on `DSD|STAT` `oam_drop`/`aff_drop`); toast 'Fix 1 problem to play'; Controls card and rebinding; New Project and first-run wizards; Help menu; Debug; Playwright smoke test in fake-toolchain mode.
7. **Visual editors** unless WS6b runs: PLAN section 6 WS6b and its definition of done. M4 needs them in the real shell. WS0 decides at CP-B whether cloud WS6b launches; if not, or if it is dropped for usage limits, build them after the shell.

## 6. Definition of done and hand-off

- The IDE opens `samples/flappy`, and edits and saves every resource type through `project-format`.
- IDE Play (the M0 IDE criterion, section 8): Play boots `fixtures/runtime/hello/hello.nds` in melonDS through the real `BuildService` in `--skip-compile --skip-assets` mode, and the `DSD|LOG|hello` line appears in Output.
- With `MockBuildService`, Play shows a fake log, and errors land in Problems.
- The Controls card appears on first Play, and the Learn panel opens on first launch.
- `electron-vite dev` and the Playwright smoke test run in a fresh worktree straight after `npm install`, and the smoke test is green.
- The renderer has no access to Node APIs, and zod validates every channel.

**Hand-off:** Runs to release in every mode (M3 IDE Play end to end, then M4 editors in the real shell). It holds WS6b's entries unless WS6b runs (hybrid: in the cloud from CP-B if usage limits allow; standard fallback: slot 2 after WS7 finishes ~week 12, memory gate permitting).

## 7. Testing in isolation and verifying without eyes

Isolation: `MockBuildService` from the Phase-0 `api.ts` (fake logs, diagnostics, a fake emulator that waits), a fixture project and the fake toolchain (`createFakeToolchain()`).

You cannot see emulator or IDE windows. Verify with (1) `DSD|` log lines (READY/LOG/ERR/MEM/STAT/EXIT per contract C8) captured by `dsdude play` / EmulatorManager, which drops the `DSD|PAD|` flush-pad lines; lines arrive live because of the flush pad, or at graceful Stop (`taskkill /PID`, `/F` after 2 s); and (2) `dsdude screenshot <rom> --frames N [--keys file] --out dir`, which writes top and bottom PNGs via py-desmume 0.0.9 with SDL_VIDEODRIVER=dummy and SDL_AUDIODRIVER=dummy. Read the PNGs with the image-capable Read tool. For the IDE, read the Playwright smoke test's window screenshots the same way. Ask the user only when a screenshot is ambiguous. Put a timeout on every spawned process, and close the dev IDE and emulator after each test.

## 8. Coordination

- `docs/status/ws6.md`: progress, spike 13 result, leftovers.
- Tiers (section 7.4): T0 doc text; T1 additive with minor bump + CHANGELOG (WS0 reviews within 24 h); T2 via `docs/adr/NNNN-<title>.md`. `tools/adr-pending.ts` lists your `// ADR-pending ADR-NNNN` markers at each checkpoint.
- Run `git restore package-lock.json`, then merge `main` into `ws6-ide` daily; never rebase once WS0 has merged any of your commits. Your branch stays local: never push (WS0 publishes `main` and the tags to `origin`), and never merge `origin/ws*` or `claude/*` refs.
- Checkpoint ritual (CP-A/B/C, weekly, and every slot hand-off in the standard fallback): commit, update `docs/status/ws6.md`, then stop touching the branch until WS0 reports the merge.
- **Cloud UI checks (hybrid).** Cloud streams never open Electron. After each checkpoint merge, check WS7's Monaco glue and Learn content and, if it runs, WS6b's editors (with their 60 fps checks) in the IDE, and record the results in `docs/status/ws6.md`. Fix shell-side causes yourself; for a failure in their paths, record the command, the first error lines and the owning stream in `docs/status/ws6.md`, and WS0 turns it into an `IF-` entry in that stream's status file (never edit it yourself).
- **Integration feedback.** WS0 appends `IF-` entries under `## Integration feedback` at the end of `docs/status/ws6.md` on `main`. Fix open entries first; never edit that section. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading; WS0 re-runs the check and appends the resolved line.

## 9. Machine limits and gotchas

- At most one Electron dev IDE and one emulator window machine-wide (hybrid and standard mode). First run `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue`; if the limit is reached, wait or use `dsdude screenshot`. Hybrid: at most 4 local instances including WS0; memory gate 1.5 GB.
- Keep the `apps/ide` Vitest browser-test project runnable with `DSDUDE_SKIP_ELECTRON=1` (no Electron binary, headless Chromium), because cloud sessions run the root `npm test` on Linux (README section 8). Electron-only tests stay in the Playwright `_electron` suite, which skips when `DSDUDE_SKIP_ELECTRON=1`.
- Set sandbox: true explicitly (electron-vite's template ships sandbox: false), keep contextIsolation, CJS preload, setWindowOpenHandler allowing only dockview popouts; CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:`; register app:// as standard/secure/supportFetchAPI before ready.
- Monaco: never @monaco-editor/react or esm/vs paths; dockview-react, not dockview.
- Use the PowerShell tool for builds, tests and spawns (CLAUDE.md, "Which shell tool").
- electron-vite externalises main and preload dependencies by default. Bundle every `@dsdude/*` workspace package (TypeScript source, no JS build) and chokidar 5 (ESM-only) through `build.externalizeDeps.exclude` for main, and bundle `@dsdude/ipc-contract` and zod for the preload. A sandboxed preload's `require` reaches only electron, events, timers and url, so the preload must be one self-contained CJS file. Keep `apps/ide/package.json` without `"type": "module"` so main and preload build as CJS, and remove it if the Phase-0 skeleton set it. The utilityProcess build worker is a second main-process entry (`build.rollupOptions.input`), bundled the same way (`docs/research/06-idestack.md`, lines 92 and 148).
- Playwright runs `electron-vite build` first, then `_electron.launch({ args: ['.'], cwd: path.resolve(import.meta.dirname, '..') })` from the test file in `apps/ide/tests/`, so it works from the worktree root and from `npm run -w apps/ide`.
- Start `electron-vite dev` with the tool's `run_in_background` and a timeout. Stop it with `taskkill /T /F /PID <pid of the electron-vite process>`, then confirm that `Get-Process electron -ErrorAction SilentlyContinue` is empty. One Electron app shows as several `electron` processes, and any `electron` process means the machine-wide dev-IDE slot is taken.
- EmulatorManager runs in the IDE main process, not the build worker. Emulators spawn without `windowsHide` (it hides their window). The build worker runs with SHLVL unset: never strip `CHERE_INVOKING=1` from the env given to `BuildService`. Output never steals focus from the emulator.
- Controls card mapping (PLAN 6 WS6) is also the first Output line of every launch; rebinding writes melonDS.toml and desmume.ini via EmulatorManager.
- New Project wizard: templates/index.json, default %USERPROFILE%\DSDudeProjects, warning under %OneDrive%; `resources/` when packaged.
- Type-check with `tsc -b`; LF line endings.

## 10. References

PLAN.md sections 1, 2.5, 2.6, 2.7, 3.1, 3.2, 3.4 (packaged content), 5 C1, C4, C5, C8, C9, C12, C13, 6 WS6 (and WS6b when it does not run), 7.1 spike 13, 7.2, 7.3, 7.4, 7.5, 8 M0, M3, M4, 9 risks 11, 15, 17, 28. `docs/kickoff/README.md` section 8 (cloud sessions). Research: `docs/research/06-idestack.md`, `docs/research/03-emulator.md`, `docs/research/04-priorart.md`, `docs/research/verification.md` claims 6, 8.
