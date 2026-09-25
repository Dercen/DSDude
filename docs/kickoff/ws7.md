# WS7 kickoff: Learn (language service, docs, samples, templates)

**Mission.** Make DSDude learnable by a 12-year-old. You own:
- the DSS language service and its Monaco glue;
- the generated reference;
- the manual, the Learn panel content and the Flappy Bird tutorial;
- the samples and the five New Project templates.

M3 needs your language service, and the M5 beginner test walks your tutorial (PLAN.md sections 1 and 8). You are a cloud stream (hybrid mode, from CP-A): a Claude Code cloud session on the GitHub repo, with no Windows tools. Anything that needs Windows (Electron, emulators, py-desmume, grit/mmutil) is checked locally by WS6, WS0 or WS8.

## 1. Paste this to start

```text
You are workstream **WS7: Learn: language service, docs, samples, templates** on DSDude, a GameMaker-like Nintendo DS IDE, running as a Claude Code **cloud session** (Ubuntu VM, no Windows tools).

- **Start:** run `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS7`, then `bash tools/cloud/start.sh` (10-minute timeout). Report failures rather than working around them.
- **Read:** `docs/kickoff/ws7.md` (its "Cloud setup" block replaces the Windows setup, env block and machine facts), `docs/kickoff/README.md` section 8, your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md`, your contract files, and only the `PLAN.md` sections they cite.
- **Paths and pushing:** write only the paths `tools/ownership.json` gives WS7. Your stream line is `ws7-learn`; push only with `bash tools/cloud/push.sh`, after every green batch.
- **Never:** commit `package-lock.json`, run `npm ci`, edit root config or `vendor/`, or run Windows tools, emulators or Electron.
- **Tests and merges:** run `npm test -w packages/language-service -w packages/monaco-dss -w tools/gen-docs && npx tsc -b packages/language-service packages/monaco-dss tools/gen-docs` before each commit, with a timeout on every process. Merge `origin/main` daily, and never rebase once WS0 has merged your commits.
- **Blockers:** if a contract blocks you, write `docs/adr/NNNN-<title>.md`, mark the workaround `// ADR-pending ADR-NNNN`, and continue.
- **Status:** fix open `## Integration feedback` entries in `docs/status/ws7.md` first, and never edit that section. The VM is ephemeral, so your branch and `docs/status/ws7.md` are your only memory: keep the file current and continue from it.

Now read docs/kickoff/ws7.md, the root CLAUDE.md, packages/language-service/CLAUDE.md and the contract files in section 4 of the kickoff file. Operating mode: hybrid (cloud session; the CLAUDE.md Status block is authoritative, and a recorded fallback uses its lines in section 2). Then begin with first task 1 (section 5).
```

## 2. When this stream starts

- **Hybrid mode (the plan):** a cloud session from CP-A (D+3), headless first, using no local slot or RAM. WS6 (local slot 3) builds the Monaco host and the Learn panel host. Milestones: M2 week 4-5, M3 week 6-7, M5 week 10-11.
- **Needed first:** `cp-a` and `main` on `origin`; WS0 has tagged `start-ws7`, pushed `ws7-learn`, registered you in `docs/status/cloud.md` and said "launch WS7 (cloud)"; the Phase-0 cloud probe (step 3) is green; a free cloud slot (if usage limits bite, WS6b is dropped first, then WS7 and WS5 wait).
- **Do not wait for:** WS4's C7 (CP-B), WS6's Monaco host and Learn panel host, or M2 (when `samples/minimal` and `samples/flappy` pass to you).
- **Fallbacks** (PLAN.md section 7.2; WS0 records a switch in the CLAUDE.md Status block):
  - *Standard* (GitHub or cloud sessions unavailable for more than a day, every push target refused, or staggering cannot absorb the usage limits): if not started, slot 2 when WS2 hands off at its definition of done (~week 5-6), under the memory gate (minimum available memory > 1.5 GB); M2 week 7-8, M3 week 11-12, M5 week 15-17. If running, continue locally with `git fetch origin; git worktree add -B ws7-learn ..\DSDude-ws7 origin/<push target>` and the README section 3 worktree setup (PLAN.md section 7.5 row: `DSDUDE_PORT_BASE` 5180); WS0 re-plans at the next checkpoint.
  - *Upgraded* (after a RAM upgrade): stay in the cloud or move home the same way; M3 week 6, M5 week 9-10.

## 3. Cloud setup

Environment `dsdude-ws7` (user, once; README section 8): network Custom (default package-manager list plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`, which WS7's Chromium download needs); variables `DSDUDE_WS=WS7`, `DSDUDE_PORT_BASE=5180`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`; the shared setup script (Node v24.16.0 in `/opt/node24`, `gcc` and `make`, Playwright 1.63.0 Chromium). Stream line `ws7-learn`; browser tests use ports 5181-5189. Canonical procedure: `docs/kickoff/README.md` section 8.

**Starting the session (user).** When WS0 says "launch WS7 (cloud)" (it has tagged `start-ws7` and pushed `main`, the tags and `ws7-learn`), open claude.ai/code or the mobile Code tab and choose repository `<user>/dsdude`, branch `ws7-learn` (or `main` if the selector does not offer it; `start.sh` adopts the stream line), environment `dsdude-ws7`, and mode **Auto** if offered, else Accept edits. The link `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-ws7` pre-fills this. Paste the section 1 block, rename the session `WS7 learn`, and give WS0 the session URL and the branch the session reports.

**First commands** (every new session; repo-local git config is not cloned):

```bash
git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS7
bash tools/cloud/start.sh     # 10-minute tool timeout
```

`start.sh` checks Node 24 and npm 11, fetches the full history, the tags, `origin/main`, `ws7-learn` and your recorded push target, and adopts the stream line without discarding stream work (it stops on divergence). It then runs the lockfile guard and `npm install` (`DSDUDE_SKIP_ELECTRON=1` makes the root postinstall skip `install-electron`), restores a lockfile npm rewrote, smoke-tests the Linux native binaries and runs `npx playwright install chromium`. Copy its last line (node, npm, push target, commits behind `origin/main`) into `docs/status/ws7.md`. If Chromium fails to download, the environment's network list lacks `cdn.playwright.dev` or `playwright.download.prss.microsoft.com`: tell the user.

**Linux env block** (set by the SessionStart hook and the environment; there is no MSYS2/Wonderful block). If a fresh Bash call shows a `node -v` other than v24, run this block and note it in the status file: the hooks run `node tools/check-ownership.ts`, which needs Node 24.

```bash
export PATH=/opt/node24/bin:$PATH
export DSDUDE_HOME=$HOME/.dsdude
export DSDUDE_SKIP_ELECTRON=1 DSDUDE_MAKE_JOBS=4
export DSDUDE_PORT_BASE=5180   # Vitest browser mode / Playwright = base+1..base+9
```

**Branch and push.**
- `ws7-learn` is your canonical stream line. WS0 creates it from `start-ws7` at launch, and `start.sh` adopts it into whatever branch the session sits on.
- Push only with `bash tools/cloud/push.sh`, after every green batch; never end a turn with unpushed work. It refuses commits that touch `package-lock.json` or lack the trailer (fix: `git commit --amend --no-edit --trailer 'DSDude-WS: WS7'`), then tries the recorded target, `ws7-learn`, `claude/ws7-learn` and the session's own branch.
- On "NEW push target": put ``Cloud push target: `<target>` `` under the title of `docs/status/ws7.md`, commit, run `push.sh` again and tell the user.
- Never push `main` or tags, force-push or open PRs.

**Lockfile** (WS0 generates it on Windows; it records the linux-x64 binaries):
- Never run `npm ci` or stage the lockfile; `git restore package-lock.json` after every install.
- New dependency: `npm install <pkg>@<exact> -w packages/monaco-dss` (or your other package); commit only that `package.json`, and WS0 regenerates the lockfile.
- Guard failure: leave the lockfile alone, write `BLOCKER lockfile` in the status file, push and tell the user; meanwhile `npm install --no-save <missing>@<version>` (e.g. `@tailwindcss/oxide-linux-x64-gnu@4.3.3`), never `--force`.

**Resume.** Reopen the same session and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/ws7.md." A reclaimed VM keeps the conversation but loses processes and unpushed files. Replace a session only when it is archived or unusable (same environment, the section 1 block plus "continue from docs/status/ws7.md", the new URL to WS0). `/compact` works; `/clear` does not.

## 4. Owned paths and contracts

**Owned** (`tools/ownership.json`, section 3.4):
- `packages/language-service/**`
- `packages/monaco-dss/**` (the Monaco glue, its own workspace package)
- `tools/gen-docs/**`
- `docs/reference/**` (gen-docs is the only docs generator)
- `docs/manual/**` except `setup/`, `assets/` and `runtime-build.md`
- `docs/tutorial/**` (including `docs/tutorial/assets/`)
- `samples/topdown-mini/**`, `samples/touch-paint/**`, and `samples/minimal/**` and `samples/flappy/**` from M2
- `templates/**` (including `templates/index.json` and `templates/library/`)
- `fixtures/language-service/**`
- the doc/example fields of existing `contracts/builtins.json` entries (field-level shared-file rule)
- `docs/status/ws7.md`, except its `## Integration feedback` section, which only WS0 appends to

**Everything else is off limits:** `packages/lang/**`, the catalogs you render, `apps/ide/**`, root config, and any other `builtins.json` field.

**Enforcement** (the hooks run once the first commands have set `core.hooksPath`):
- `.githooks/pre-commit` runs `tools/check-ownership.ts`, which compares against `origin/main` in the cloud.
- `.githooks/commit-msg` adds `DSDude-WS: WS7` and rejects `package-lock.json`.
- WS0's integration re-checks every commit (field-level for `builtins.json`) and refuses violations.
- Generated paths (`packages/*/src/gen/**`, `runtime/gen/**`, `docs/reference/**`) change only with their generator input.

**Contracts** (record their `contracts/CHANGELOG.md` versions in your status file):
- **C2** `contracts/builtins.json`: you fill `TODO(WS7)` doc/example fields as T0 changes.
- **C7** `packages/lang/src/host.ts`: consumer, frozen at CP-B.
- **C6** `contracts/language.md`, `contracts/events.md`: consumer.
- **C9** `contracts/diagnostics.md` plus the five catalogs `packages/project-format/src/diagnostics/catalog.ts`, `packages/compiler/src/diagnostics/catalog.ts`, `packages/asset-pipeline/src/diagnostics/catalog.ts`, `packages/toolchain/src/diagnostics/catalog.ts` and `runtime/core/diagnostics/catalog.json`: consumer.
- **C12** `apps/ide/src/renderer/panels/api.ts` and `fixtures/ide/mock-host`: consumer.
- **C1** `packages/project-format` and **C13** `contracts/runtime-limits.json`: consumers.

## 5. First tasks (in order)

1. **Manual, generator and builtin docs.**
   - Write the manual chapters in `docs/manual/`: Differences from GameMaker, Two screens and touch, Sprites and palettes, Rooms and views, and Sounds.
   - "Differences" opens with the section 4 concept map and lists:
     - the section 1 non-goals;
     - the `alias`/`unsupported` entries of `builtins.json`;
     - the high-score pattern (`game_start.dss` + `global.*`).
   - `tools/gen-docs` writes `docs/reference/functions.md`, `variables.md`, `errors.md` and `limits.md`. Its output is deterministic (sorted, LF).
   - Fill every `TODO(WS7)`; WS0 wrote the ~30 Flappy ones. Each such commit also carries a `contracts/CHANGELOG.md` line under the C2 `builtins.json` section (the shared-file rule allows exactly this), regenerated `node tools/gen-builtins.ts` outputs (a no-op diff if the generated files carry no doc text) and regenerated reference pages.
   - Add a test that loads every template through `project-format`.
2. **Editor support.**
   - In `packages/monaco-dss`: the Monarch tokenizer and builtins-only completion and hover.
   - Then the full service in `packages/language-service` over C7. It runs in a Web Worker, without Monaco, and provides:
     - completion with event and pattern snippets;
     - hover and signature help;
     - definition, references, symbols, folding and format;
     - diagnostics debounced 150 ms via `setModelMarkers`;
     - the did-you-mean code action;
     - F1 opening the reference entry.
3. **Learn content and tutorial.**
   - `docs/tutorial/flappy-bird.md` rebuilds the section 4 listing from Empty, with screenshots. Emulator and IDE captures are local-only: list each one you need (frame, keys file) in your status file for WS0/WS8 (section 7).
   - Its assets go in `docs/tutorial/assets/`: `bird.png`, `pipe.png`, `gap.png`, `flap.wav`, `point.wav` and `hit.wav`.
   - Give each `errors.md` code a stable anchor for Problems links. Agree the link form with WS6, by ADR if C12 lacks it.
4. **Templates and library.**
   - `templates/index.json` lists Empty, Flappy Bird (the finished sample), Top-down, Touch paint and Platformer starter.
   - `templates/library/` holds 3-4 CC0 tracker tracks, 8 CC0 effects and a `LICENSES.md`.
   - Build `samples/topdown-mini` and `samples/touch-paint`.
   - Packaging copies only `templates/**`. Keep the sample-based templates identical to `samples/*` with a test, or propose another layout by ADR.
5. **At M2:** take over `samples/minimal` and `samples/flappy`.

## 6. Definition of done and hand-off

- The Vitest suite over the service (no Monaco) covers completion in 20 cursor contexts and hover for every builtin.
- The Monaco glue is tested in `@vitest/browser-playwright` (headless Chromium in the cloud).
- In the IDE, typing `draw_` lists all draw functions with docs, and an unknown variable is underlined within 200 ms. The browser-mode test proves it in the cloud; WS6 confirms it in the Electron IDE at a checkpoint.
- CI fails on stale generated docs.
- Samples and templates compile with zero diagnostics, convert, and run at 60 fps on both emulators per `DSD|STAT`. Each template's `dsdude screenshot` passes its stated check. Only the compile runs in the cloud; WS0/WS8 verify the rest locally, and no `IF-` entry may stay open. Linux green alone is never done.
- The tutorial has been walked by a fresh Claude session; the M5 human walk-through (section 8) is closed out in a short WS7 cloud session at M5 (~week 10-11).

**Hand-off.**
- **Hybrid:** you run to your definition of done in the cloud. The M5 walk-through and post-M5 fixes run as short WS7 cloud sessions (same environment, section 3 resume procedure).
- **Standard fallback:** you finish ~week 12, and slot 2 may then run WS6b. The M5 walk-through and post-M5 fixes run as short WS7 sessions.
- **Always:** you keep your paths and record leftovers in `docs/status/ws7.md`.

## 7. Isolation and verifying without eyes

**Isolation:** builtins-only features from builtins.json until the C7 host API lands; docs and templates need only project-format; the Monaco glue is tested in @vitest/browser-playwright with headless Chromium in the cloud (ports 5181-5189). The Electron IDE is opened only locally, by WS6/WS0 at checkpoints.
- Until C7 lands, use a fake of it in `fixtures/language-service/`.
- Before M2, check templates with `npx dsdude compile <project> -o <build>/nitrofs/game.dsdb --json`. Exit 0 means no diagnostics. If `npx dsdude compile` is not wired yet (WS1 registers `@dsdude/compiler`'s `cliCommands` in `packages/cli`), call `compileProject` from `@dsdude/compiler` in a Vitest test instead.

**Verify without eyes:**
- **In the cloud:** the Vitest suites, gen-docs output, `npx dsdude compile --json`, and a browser-mode test that types into real Monaco for the `draw_`/200 ms criteria.
- **Local only:** `DSD|` lines (C8), `dsdude screenshot` PNGs (py-desmume), 60 fps (`fps=60` in `DSD|STAT` from `dsdude play <sample>`, and with `--emulator desmume`), grit/mmutil conversion and the Electron IDE. WS0 verifies this locally at integration; watch the integration-feedback list in `docs/status/ws7.md`.
- **Template checks:** write each template's stated check (frame, keys file, what the PNG shows) in your status file; WS0/WS8 run them and report failures as `IF-` entries.

Ask the user only when a reported check is ambiguous.

## 8. Coordination

- **Change tiers (section 7.4):**
  - **T0:** your doc/example edits.
  - **T1:** a new builtin or alias, which WS0 makes. Send an ADR draft.
  - **T2:** co-signed ADRs.
  - If C7 lacks something, write an ADR to WS4 and mark your workaround `// ADR-pending ADR-NNNN`.
- **Daily:** `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`. Never rebase once WS0 has merged your commits. Keep `docs/status/ws7.md` current (progress, pinned versions, `start.sh`'s version line, leftovers, `ADR-pending` markers).
- **Feedback:** after each fetch, read `docs/status/checkpoint-N.md` and your `## Integration feedback` section on `origin/main` (`git show origin/main:<path>`), and fix open `IF-` entries first. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading and push; WS0 re-runs the check and appends the resolved line. WS0 integrates your `origin/<push target>` with `tools/checkpoint.ps1`.
- **At each checkpoint** (CP-A/B/C, then weekly): commit, update your status file (including `start.sh`'s version line), push with `push.sh`, then stop touching the branch until the user relays "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..." (README section 5; in the web UI or with `claude -p "<message>" --cloud <session-id>`), and do what the relay says: the VM may have been reclaimed while you waited.

## 9. Machine limits and gotchas

- **Cloud VM:** besides the section 1 "Never" list, never install system packages (setup-script changes go through a WS0 ADR), store secrets in environment variables, or leave background processes running.
- **Tests:** `vitest run`, no watch mode; stop every dev server and browser before the turn ends. If the Stop-hook reminder arrives while tests are red, fix or revert first.
- **Files:** use LF.
- **Type-checking:** use `tsc -b`, never `--noEmit`.
- **Erasable syntax only** (no enums, namespaces or parameter properties) and explicit `.ts` relative imports: `npx dsdude` runs the source under Node 24 type stripping. Vitest (esbuild) accepts both, so only the `tsc -b` in your pre-commit test catches them (`CLAUDE.md`, "Code rules").
- **Monaco 0.57:** import `'monaco-editor/editor'`, `'monaco-editor/features/register.all'` and `'monaco-editor/editor/editor.worker?worker'`. Never import `monaco-editor/esm/vs/...` or `@monaco-editor/react`.
- **`contracts/diagnostics.md` style** applies to messages and docs:
  - written for a 12-year-old;
  - none of the banned words (instruction, token, identifier, operand, arity, expression, opcode, VRAM, OAM, palette slot);
  - the code comes after the message, as a link.
- **Tutorial:** `obj_gap` is Visible off, with `spr_gap` for its bbox and `scored = false;` in `create.dss`. `obj_ctrl` is Visible off and starts the spawn timer with `alarm[0] = 60;` in `create.dss`; `rm_game` is 256x192. Follow ADR-0001's decision on the pipe geometry (upper and lower pipes).
- **M5 free-play prompts** ('add a high score', 'make the pipes speed up as the score rises') must not already be solved by the tutorial.
- **Library music** must be tracker files (MP3 music is E4xx).
- **W031** fires only for instance touch events on Top-screen objects, so `obj_bird`'s `touch_pressed()` is fine.

## 10. References

- **PLAN.md sections:** 1, 2.5, 2.7, 3.4 (ownership table, shared-file rules, packaged content), 4, 5 C2, C6, C7, C9, 6 WS7 and WS6's Learn panel, 7.2, 7.4, 7.5 (cloud sessions), 8 M2, M3, M5, and 9 risks 15, 22, 23, 26 and 28.
- **Cloud procedure:** `docs/kickoff/README.md` section 8 (canonical).
- **Research files:** `docs/research/04-priorart.md`, `docs/research/06-idestack.md`, and `docs/research/verification.md` claim 8.
