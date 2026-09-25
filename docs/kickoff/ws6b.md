# WS6b kickoff: Visual editors (optional cloud stream, usage-limit-gated; otherwise part of WS6)

WS6b builds the sprite editor, room editor, background editor and sound panel. Each one is a pure-function core in `packages/editor-core` plus a React view under `apps/ide/src/renderer/editors/`, and every view runs standalone in WS6's mock host. The editors are part of the M4 criterion (section 8). The object editor is WS6's. You are an optional cloud stream (hybrid mode), launched at CP-B only if usage limits allow; otherwise WS6 does this work and holds these paths. You never open Electron; WS6 checks your editors in the real shell.

Paths are relative to the repo root, which for you is the cloud clone. WS0's local repo is `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`.

## 1. Paste this to start

```text
You are workstream **WS6b: Visual editors** on DSDude, a GameMaker-like Nintendo DS IDE, running as a Claude Code **cloud session** (Ubuntu VM, no Windows tools).

- **Start:** run `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS6b`, then `bash tools/cloud/start.sh` (10-minute timeout). Report failures rather than working around them.
- **Read:** `docs/kickoff/ws6b.md` (its "Cloud setup" block replaces the Windows setup, env block and machine facts), `docs/kickoff/README.md` section 8, `packages/editor-core/CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md`, your contract files, and only the `PLAN.md` sections they cite.
- **Paths and pushing:** write only the paths `tools/ownership.json` gives WS6b. Your stream line is `ws6b-editors`; push only with `bash tools/cloud/push.sh`, after every green batch.
- **Never:** commit `package-lock.json`, run `npm ci`, edit root config or `vendor/`, or run Windows tools, emulators or Electron.
- **Tests and merges:** run `npm test -w packages/editor-core` (plus `npm test -w apps/ide` for view changes) before each commit, with a timeout on every process. Merge `origin/main` daily, and never rebase once WS0 has merged your commits.
- **Blockers:** if a contract blocks you, write `docs/adr/NNNN-<title>.md`, mark the workaround `// ADR-pending ADR-NNNN`, and continue.
- **Status:** fix open `## Integration feedback` entries in `docs/status/ws6b.md` first, and never edit that section. The VM is ephemeral, so your branch and `docs/status/ws6b.md` are your only memory: keep the file current and continue from it.

Test in isolation with the fixtures and mocks in docs/kickoff/ws6b.md; do not wait for other streams. Operating mode: hybrid (cloud session; the CLAUDE.md Status block is authoritative). Then begin with task 1 of section 5 in docs/kickoff/ws6b.md.
```

## 2. When this stream starts

- **Hybrid mode (the plan):** cloud, from CP-B (D+7) = M0 (week 2), only if the usage limits (open question 3) cover a fifth cloud session. WS6b is shed first when limits bite; WS6 then builds the editors after the shell. M4 (editors in the real shell) week 8-9, release 0.1 around week 12-14.
- **Fallbacks** (WS0 records a switch in the CLAUDE.md Status block):
  - *Standard mode* (GitHub or cloud sessions unavailable for more than a day, every push target refused, or staggering cannot absorb the usage limits): folded into WS6 unless the memory gate frees a slot. The earliest start is slot 2 after WS7 finishes (~week 12), and only if WS6 is still busy. From ~week 12 the slots are: slot 1 WS8, slot 2 WS6b or free, slot 3 WS6. The rest of the calendar: M4 week 14-16, release 0.1 around week 16-20. If you are already running, WS0 re-plans at the next checkpoint; a local continuation is `git fetch origin; git worktree add -B ws6b-editors ..\DSDude-ws6b origin/<push target>` plus the usual worktree setup (README section 3).
  - *Upgraded mode* (after a RAM upgrade): only in a slot freed by a finished stream, and only if the memory gate allows. Otherwise WS6 builds the editors after the shell. M4 is at week 8. A running cloud WS6b may move home the same way.

**Gates** (all must hold before your first commit):
1. WS6 has published the C12 panel API (`apps/ide/src/renderer/panels/api.ts`) and `fixtures/ide/mock-host` on `origin/main` (frozen at CP-A).
2. WS5 has published the preview API (`packages/asset-pipeline/src/preview.ts`) on `origin/main` (frozen at CP-B).
3. WS0 has launched you: usage limits confirmed at CP-B, `start-ws6b` and `ws6b-editors` pushed, your line in `docs/status/cloud.md`. (Standard fallback: the latest `docs/status/checkpoint-N.md` shows minimum available memory above 1.5 GB.)
4. WS6 has committed any editor work in your paths, and WS0 has confirmed that `tools/ownership.json` now assigns those paths to WS6b. Read `git show origin/main:docs/status/ws6.md` to see what already exists.

## 3. Cloud setup

Environment `dsdude-ws6b`, stream line `ws6b-editors`, port base 5170 (browser tests 5171-5179). `docs/kickoff/README.md` section 8 is canonical. The PowerShell env block, worktrees, MSYS2/Wonderful paths and Windows machine facts do not apply.

**Environment.** Environment `dsdude-ws6b` (user, once; README section 8): network Custom (default package-manager list plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`); variables `DSDUDE_WS=WS6b`, `DSDUDE_PORT_BASE=5170`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`; the shared setup script (Node v24.16.0 in `/opt/node24`, `gcc` and `make`, Playwright 1.63.0 Chromium).

**Launch (user).** When WS0 says "launch WS6b (cloud)" (it has tagged `start-ws6b` and pushed `main`, the tags and `ws6b-editors`), open claude.ai/code or the mobile Code tab and choose repository `<user>/dsdude`, branch `ws6b-editors` (`main` if not offered; start.sh adopts the stream line), environment `dsdude-ws6b`, and mode **Auto** if offered, else Accept edits. `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-ws6b` pre-fills this. Paste section 1, rename the session `WS6b editors`, and give WS0 the session URL and the branch the session reports.

**First commands** (every new session; repo-local git config is not cloned):

```bash
git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS6b
bash tools/cloud/start.sh     # 10-minute tool timeout
```

`start.sh` checks Node 24 / npm 11; fetches the full history, tags, `main`, `ws6b-editors` and your registered push target; adopts the stream line without discarding work (on divergence it stops: note it in `docs/status/ws6b.md` and tell the user); runs the lockfile guard and `npm install` (never `npm ci`; `DSDUDE_SKIP_ELECTRON=1` makes the root postinstall skip `install-electron`), restoring any lockfile rewrite; smoke-tests the Linux native binaries; runs `npx playwright install chromium`; and prints a version line for `docs/status/ws6b.md`.

**Linux env block.** The SessionStart hook and the environment provide these; there is no MSYS2/Wonderful block. If a fresh Bash call shows a `node -v` other than v24, run the block and note it in `docs/status/ws6b.md`.

```bash
export PATH=/opt/node24/bin:$PATH
export DSDUDE_HOME=$HOME/.dsdude
export DSDUDE_SKIP_ELECTRON=1 DSDUDE_MAKE_JOBS=4
export DSDUDE_PORT_BASE=5170   # Vitest browser mode / Playwright = 5171-5179; no electron-vite dev server in the cloud
```

**Lockfile.** The Windows-generated `package-lock.json` records the linux-x64 binaries, so a Linux `npm install` gets them. Never stage, delete or regenerate it; run `git restore package-lock.json` after every install. A new dependency is `npm install <pkg>@<exact> -w packages/editor-core`, committing only that `package.json` (`apps/ide/package.json` is WS6's: ask by ADR). If the guard fails, leave the lockfile alone, write `BLOCKER lockfile` in `docs/status/ws6b.md`, push it and tell the user; meanwhile run `npm install --no-save <missing>@<version>` (e.g. `@tailwindcss/oxide-linux-x64-gnu@4.3.3`), never `--force`.

**Branch and push.**
- WS0 creates `ws6b-editors` from `start-ws6b` at launch, and start.sh resumes it in every session.
- Push only with `bash tools/cloud/push.sh`, after every green batch; never end a turn with unpushed work. push.sh refuses commits that change `package-lock.json` or lack the `DSDude-WS: WS6b` trailer, then tries the recorded target, `ws6b-editors`, `claude/ws6b-editors` and the session's own branch.
- On "NEW push target", put ``Cloud push target: `<ref>` `` under the title of `docs/status/ws6b.md`, commit, run push.sh again and tell the user.
- Never push `main` or tags, force-push or open PRs.

**Resume.** Reopen the same session and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/ws6b.md." A reclaimed VM keeps the conversation but loses processes and unpushed files. Replace a session only when it is archived or unusable: same environment, the section 1 paste block plus "continue from docs/status/ws6b.md", and the new URL to WS0. `/compact` works; `/clear` does not.

## 4. Owned paths and contracts

**You own:**
- `apps/ide/src/renderer/editors/**` (the sprite, room and background editors and the sound panel; the object editor is WS6's)
- `packages/editor-core/**`
- `fixtures/editors/**`
- `docs/status/ws6b.md` (except its `## Integration feedback` section, which WS0 appends to)
- (When WS6b does not run, WS6 holds these entries)

**You may not touch** anything else. This includes the following files, which belong to WS6:
- the rest of `apps/ide/**`;
- `apps/ide/package.json`, which already has `pixi.js`, `immer` and `zustand` pre-installed in Phase 0;
- `apps/ide/vitest.config.ts`. If your browser-mode tests need a project entry there, ask for it with an ADR draft.

**How ownership is enforced:**
- `.githooks/pre-commit` runs `tools/check-ownership.ts`, keyed on `dsdude.ws` (set by your first command). In the cloud it compares against `origin/main`.
- `.githooks/commit-msg` adds the `DSDude-WS: WS6b` trailer and rejects `package-lock.json`; `push.sh` checks both again.
- WS0's integration checks every non-merge commit in `main..origin/<push target>` and refuses the merge on a violation.

**Contracts.** You consume all of these and own none. Pin each one to its version in `contracts/CHANGELOG.md`.

| Contract | Files | Use |
|---|---|---|
| C12 EditorPanel host API | `apps/ide/src/renderer/panels/api.ts`, `fixtures/ide/mock-host` | `EditorPanel {id, kind, open(resource), save(), dispose(), onDirty}`; host services (project store, IPC client, undo stack, toast) |
| C12 asset preview API | `packages/asset-pipeline/src/preview.ts` | `previewSprite(png, opts) → {palette, indices, colorCount, frames}` |
| C1 Project format | `packages/project-format`, `contracts/project-format.md` | `sprite.json` + `sheet.png`, `background.json`, `sound.json`, `room.json` (`layout`, `screens.top/bottom`, `instances`) |
| C6 event names | `contracts/events.md` | event names |
| C13 limits | `contracts/runtime-limits.json` | live meters |

## 5. First tasks (in order)

1. **Read and pin.** Read the contracts above and `samples/flappy`, then record the contract versions and start.sh's version line in `docs/status/ws6b.md`.
2. **Sprite core** (`packages/editor-core`). Write pure functions over `Uint8Array` index buffers + BGR555 palettes: pencil, fill, line, rect, select/move and mirror, plus onion skin and an animation strip. Undo uses immer patches. Test with Vitest in node, and put the test inputs in `fixtures/editors/`.
3. **Sprite view.** A Canvas 2D `EditorPanel` in `apps/ide/src/renderer/editors/` that renders `ImageData` at zoom (`docs/research/06-idestack.md` §4). Run it in `fixtures/ide/mock-host` in headless Chromium with `samples/flappy`, and save through `project-format`.
4. **Room core.** Place, drag and delete instances; a grid-snap paint mode for invisible `obj_wall` instances; a view rectangle per screen; undo. `room.json` must round-trip.
5. **Room view** in PixiJS 8.
   - Both screens stacked, zoom/pan and a grid.
   - The document lives in zustand, and Pixi is only the view.
   - Add the 60 fps `@vitest/browser-playwright` check (ports 5171-5179). In the cloud it only reports (software WebGL); WS6 enforces it in the shell.
6. **Background editor** with a tile-count meter (`bgTilesMax` 1024, `bgMaxSize` 512).
7. **Sound panel:** import, preview playback and loop points (`smpl` loop >= 16 samples, section 2.9).
8. **Live meters** inside the editors (the status-bar meters are WS6's).
   - Limits come from `contracts/runtime-limits.json`: `spritesPerScreen`, `affinePerScreen`, `objVramBytesPerScreen`/`objVramAlignBytes`, `obj16PalettesPerScreen` and `obj256PalettesPerScreen`.
   - Actual figures come from `assets.manifest.json` in the project's build directory (section 3.2).
   - Plain language, with hardware terms only in tooltips (section 1, step 5).

## 6. Definition of done (verbatim) and hand-off

- A beginner builds `rm_game` with the mouse, and the room JSON round-trips.
- Placing the 129th sprite-bearing instance on a screen shows a red meter, not a crash.
- The room editor holds 60 fps at 4x zoom on a 1024x512 room with 200 instances (`@vitest/browser-playwright` check).
- Undo/redo works in the sprite and room editors.
- Every editor core has Vitest coverage in node.

**Hand-off:** the stream ends at its definition of done. Its entries stay WS6b's, and later fixes run as short WS6b cloud sessions in `dsdude-ws6b` (or fall to WS6 if WS6b never ran). List leftovers in `docs/status/ws6b.md`.

## 7. Testing in isolation and verifying without eyes

**Isolation:** editor cores are pure; views render in `fixtures/ide/mock-host` with `samples/flappy`, in headless Chromium (`@vitest/browser-playwright`, ports 5171-5179).

**Verify without eyes.** You cannot see any window, and the cloud has no emulator, py-desmume or Electron.
- **Editor visuals:** take a Playwright screenshot of the mock host and read it with the image-capable Read tool.
- **`DSD|` lines, `dsdude screenshot` and end to end** (`dsdude build` of an editor-saved room): WS0 verifies this locally at integration, and WS6 checks your editors in the Electron IDE after each checkpoint merge; watch the integration-feedback list in `docs/status/ws6b.md`. Keep an editor-saved room in `fixtures/editors/` and name it in your status file, so they have something to build.
- Ask the user only when a screenshot is ambiguous.

## 8. Coordination

**Daily:**
- Run `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`. Never rebase once WS0 has merged any of your commits.
- After each fetch, read the latest `docs/status/checkpoint-N.md` and your `## Integration feedback` section on `origin/main` (`git show origin/main:<path>`). Fix open `IF-` entries first. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading and push; WS0 re-runs the check and appends the resolved line.
- Keep `docs/status/ws6b.md` current and pushed.
- WS0 integrates `origin/<push target>` with `tools/checkpoint.ps1` and pushes `main` with `docs/status/checkpoint-N.md`.

**At a checkpoint** (CP-C at D+14, then weekly):
1. Commit.
2. Update `docs/status/ws6b.md` with progress, leftovers, open `ADR-pending` markers and start.sh's version line.
3. Push with `bash tools/cloud/push.sh`, then stop touching the branch until the user relays "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..." (README section 5; in the web UI or with `claude -p "<message>" --cloud <session-id>`), and do what the relay says: the VM may have been reclaimed while you waited.

**Contract changes** (section 7.4): T0/T1 are the owner's; T2 needs an ADR. You own no contract, so request any change as a new `docs/adr/NNNN-<title>.md` and mark your workaround `// ADR-pending ADR-NNNN`. You co-sign breaking C5/C12 ADRs, but see them only after WS0 pushes `main`: check `docs/adr/` after each fetch.

## 9. Machine limits and gotchas for this stream

**Cloud limits** (the Windows machine facts and the memory gate do not apply):
- **Ephemeral VM:** push every green batch; leave no background processes (no dev servers, no watch mode). Run `vitest run` and put a timeout on every spawned process.
- **Never** (besides the section 1 list): run py-desmume, install system packages (setup-script changes go through a WS0 ADR), push other than via `push.sh`, or store secrets in environment variables.
- **Line endings:** LF (Biome `lineEnding: "lf"`, `core.autocrlf false`). Type-check with `tsc -b`.
- **Linux green alone is never done:** WS0 reruns `npm test` on Windows at every integration (separators, case, CRLF) and reports failures as `IF-` entries.

**Stream gotchas:**
- No Electron in the cloud: develop views in the mock host and test with Vitest / @vitest/browser-playwright in headless Chromium.
- editor-core works on Uint8Array index buffers + BGR555 palettes; undo via immer patches.
- Sprite view: Canvas 2D with imageSmoothingEnabled=false and image-rendering: pixelated. Room editor: PixiJS 8 with scaleMode 'nearest', both screens stacked, layout "separate", a background per screen.
- Block platformers use invisible obj_wall instances (visible = false costs no OAM slot) placed with a grid-snap paint mode.
- Meters come from contracts/runtime-limits.json and the manifest; sprites > 128 per screen show a red meter, never a crash.

**Renderer:**
- The renderer is sandboxed with no Node APIs, so file access goes through the C12 host services.
- The CSP (section 2.5) allows `img-src 'self' data:` and has no `'unsafe-eval'`, so build Pixi textures from `ImageData`/`ImageBitmap`, not `blob:` URLs.
- On day 1, verify in headless Chromium that PixiJS 8 renders under this CSP; WS6 confirms it in the shell. If it reports an eval violation, import `pixi.js/unsafe-eval` rather than loosening the CSP. If it still fails, file an ADR.

## 10. References

**PLAN.md:** 1, 2.5, 3.3, 5 C1, C6, C12, C13, 6 WS6b, 7.2, 8 M4. As needed: 3.4, 7.3 (late-start freeze rule), 7.4, 7.5 (cloud sessions), 9 risks 22-28.

**Kickoff:** `docs/kickoff/README.md` section 8 (cloud sessions, canonical).

**Research:** `docs/research/06-idestack.md` (§4), `docs/research/05-hardware.md`.
