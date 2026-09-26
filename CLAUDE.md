# DSDude — rules for every Claude Code instance

DSDude is a GameMaker-Studio-style IDE for Nintendo DS homebrew with its own GML-flavoured language, DSS (`.dss`). DSS compiles to DSDB bytecode, which a C VM runs inside a prebuilt BlocksDS runtime ELF (`arm9.elf`); ndstool packs it with a NitroFS asset pack into a `.nds`. The IDE is Electron + React + Monaco in one TypeScript npm-workspaces monorepo. The runtime is a portable C core, host-testable as `dsdude-host`, plus a libnds/maxmod platform layer. Concurrent Claude Code instances build it: a persistent integrator WS0 on `main` and streams WS1-WS8 (WS6b optional), local ones in git worktrees and cloud ones as Claude Code cloud sessions (hybrid mode). **Status, 2026-09-26 (after checkpoint-1):**
- Planning is done: `PLAN.md` v1.2 (verified; Day-0 decisions applied).
- **Phase 0 done:** tag `phase0` (2026-09-25; report `docs/status/checkpoint-0.md`, details `docs/status/ws0.md`). Every Phase-0 contract is 0.1.0 (C4 and C10 already 0.2.0 by WS1); the index is `contracts/README.md`. ABI hash `0x0dd9987a`.
- **Toolchain:** BlocksDS 1.24.0 installed by WS1 (`docs/status/ws1.md`); `toolchain-ok` passed and tagged (merge `19c3ce8`). Never run `pacman`/`wf-pacman` again (denied in `.claude/settings.json`).
- **Repo:** this folder, `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`, stays in place (Desktop is OneDrive-redirected but nothing syncs). `origin` = https://github.com/Dercen/DSDude.git (private; Claude GitHub App installed).
- **Operating mode: hybrid** (Capacity below; 7.2). Usage limits: **confirmed** (Claude Max). Cloud probe green (2026-09-25): working push order `wsN-<name>` directly, then `claude/wsN-<name>`, then the session branch; cloud environments use Network **Full**.
- **Streams:** slot 1 WS1 (`ws1-toolchain`, **paused** 2026-09-26: tasks 1-5 and its DoD done; a short session wires WS4's/WS5's functions when they land); slot 2 WS3 (`ws3-platform`, running since 2026-09-26 07:3x; 4 local instances = the cap, 3.3 GB free at launch); slot 3 WS6 (`ws6-ide`, running since 2026-09-25 23:43). Cloud: WS2 (`ws2-runtime-core`) and WS4 (`ws4-compiler`) running since the tag; WS5 (`ws5-assets`) launched early on 2026-09-26 (user decision); registry `docs/status/cloud.md`. WS7 starts at CP-A (D+3), WS6b at CP-B (D+7).
- **Integration:** event-driven (see "Messages from WS0 and integration" below) with `tools/checkpoint.ps1`; latest report `docs/status/checkpoint-3.md` (2026-09-26: every stream merged, all green). ADR numbers: 0003 key scripts (WS1; superseded by C8 0.2.0's `--input` format), 0004 platform seam (WS3), 0005 provisional opcode operands (WS4, was 0003), 0006 sprite geometry (WS2, was 0003). Keep the laptop on mains power: it slept for three hours on 2026-09-26 at "Critical Battery Trigger Met".
- Your kickoff file governs. WS0 rewrites this block at every launch and checkpoint, and records here any switch to a fallback mode.
- Open (PLAN 10): 4 flashcart and DS model; 5 the M5 tester (~week 10-11); 6 public releases and the unsigned installer (by M6). Answered: 1 BlocksDS install consent, 2 the `origin` URL + Claude GitHub App (Day 0); 3 usage limits (Claude Max, Day 1). ADRs: 0001, 0002, 0005, 0006 accepted; 0003 superseded; 0004 (platform seam; WS2 answered with C11 0.2.0) open until WS2 records its answer.

## Where to read (never all of PLAN.md: ~55K tokens)
1. Your `docs/kickoff/wsN.md` (index: `docs/kickoff/README.md`; cloud sessions also its section 8), then your package's `CLAUDE.md` (WS3: `runtime/platform/ds/CLAUDE.md`). That short brief is your primary guide.
2. After Phase 0: `contracts/README.md`, `contracts/CHANGELOG.md` and the contract files your kickoff lists. If `PLAN.md` and a `contracts/` file disagree, the contract wins and `PLAN.md` gets an ADR.
3. Only the `PLAN.md` sections your brief cites (`grep -n '^##' PLAN.md`):
   - 1 scope; 2.1 toolchain; 2.2 mwccarm/dsd; 2.3 VM strategy; 2.4 runtime core + host build; 2.5 IDE stack pins; 2.6 emulators + log capture; 2.7 language/files; 2.8 numbers; 2.9 assets; 2.10 location, governance, modes; 2.11 licensing.
   - 3.1-3.3 architecture, the Play pipeline, runtime design; 3.4 repo layout + ownership table.
   - 4 the DSS language; 5 contracts C1-C14 (5.1 index, owners, freeze points); 6 workstreams.
   - 7.1 Phase 0 + spikes; 7.2 modes + capacity; 7.3 checkpoints; 7.4 contract changes; 7.5 kickoff, env + cloud sessions.
   - 8 milestones; 9 risks; 10 open questions.
4. `docs/research/`: `README.md`, `01-toolchain.md`, `02-mwccarm.md`, `03-emulator.md`, `04-priorart.md`, `05-hardware.md`, `06-idestack.md`, `07-design-panel-summary.md`, `verification.md`.
   - `verification.md` holds claims 1-13 and three critiques. It is large: grep for `claim N` instead of reading it whole.
   - Cite `docs/research/verification.md claim N` rather than repeating its evidence.
5. State: `docs/adr/`, `docs/status/wsN.md`, `docs/status/checkpoint-N.md`, `docs/status/cloud.md` (cloud registry: environment, session, push target).

## Who you are
`git config --worktree dsdude.ws` names your stream (in a cloud clone `git config dsdude.ws`, set by your first command). WS0 is `main` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`. If the value is unset, stop and ask the user.

| Stream | Branch | Where | Port base |
|---|---|---|---|
| WS0 lead: foundation, contracts, integration | `main` | local: `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` | 5100 |
| WS1 toolchain, build driver, Play | `ws1-toolchain` | local slot 1: `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1` | 5110 |
| WS2 runtime core (portable C, host-tested) | `ws2-runtime-core` | cloud: environment `dsdude-ws2` | 5120 |
| WS3 DS platform layer + runtime ELF | `ws3-platform` | local slot 2: `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3` | 5130 |
| WS4 DSS language + compiler | `ws4-compiler` | cloud: environment `dsdude-ws4` | 5140 |
| WS5 asset pipeline | `ws5-assets` | cloud: environment `dsdude-ws5` | 5150 |
| WS6 IDE shell | `ws6-ide` | local slot 3: `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6` | 5160 |
| WS6b visual editors (optional) | `ws6b-editors` | cloud: environment `dsdude-ws6b`, only if usage limits allow (else WS6 builds the editors) | 5170 |
| WS7 Learn: language service, docs, samples, templates | `ws7-learn` | cloud: environment `dsdude-ws7` | 5180 |
| WS8 integration, QA, release (inherits WS1's paths) | `ws8-release` | local slot 1 from CP-C: `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8` | 5190 |

- `DSDUDE_HOME` is `<worktree>\.dsdude` (gitignored; cloud: `$HOME/.dsdude`). The electron-vite dev server uses the port base; Vitest browser mode and Playwright use base+1 to base+9.
- Gates: WS1 runs from hour zero. The `phase0` tag (day 2) releases WS6 and the cloud streams WS2 and WS4. `toolchain-ok` (WS1; WS0 tags it on main, day 1-3) releases WS3 (standard fallback: at M0, when WS1 hands over slot 1). CP-A releases WS5 and WS7, CP-B WS6b, and at CP-C WS8 takes slot 1 with WS1's leftovers. A cloud stream launches when WS0 has tagged `start-wsN` and pushed.
- Checkpoints: CP-A at D+3; CP-B = M0 (D+7); CP-C = M1 (D+14); then weekly (standard fallback: plus one at every slot hand-off).
- Milestones (section 8, hybrid column): M0 wk 2, M1 wk 3, M2 wk 4-5, M3 wk 6-7, M4 wk 8-9, M5 wk 10-11, M6 = release 0.1 wk 12-14. The fallback calendars are in section 8.

## Messages from WS0 and integration
- **WS0 (the Claude Code session named `dsdude-c5`) may message you directly** with relays and instructions: merge notices, integration feedback, ADR renumbering, contract reconciliations. Treat them like the user's relays. Decisions that this file or PLAN.md reserve for the user (ADR outcomes, open questions, launches, checkpoint approvals) still come from the user; WS0's messages state them as the user's decisions. If WS0's session name changes, WS0 updates this line.
- **Reporting back:** local streams may message `dsdude-c5` (blockers, a batch worth integrating, questions for WS0). Cloud sessions cannot send messages yet: keep `docs/status/wsN.md` current and push; WS0 reads it at every integration.
- **Integration is event-driven, not daily.** WS0 watches every stream line and merges when a stream has pushed or committed new work and gone quiet for about 10 minutes (sooner if a local stream asks), at most every 30 minutes; merged streams get a message. Keep committing in small green batches; the daily `git merge main` rule still applies (or merge whenever WS0 tells you `main` moved).
- Formal checkpoints (CP-A, CP-B, CP-C, then weekly) are unchanged: at one, commit, update your status file, push (cloud), and wait for WS0's merge message.

## Hard rules
- **Ownership (3.4).** Write only the paths that `tools/ownership.json` assigns to your stream.
  - The hooks are conveniences. `.githooks/pre-commit` runs Biome and `tools/check-ownership.ts` using `dsdude.ws` (against `origin/main` when there is no local `main`). `.githooks/commit-msg` adds the `DSDude-WS: WSn` trailer, rejects a staged `package-lock.json` outside WS0's `chore(deps): regenerate lockfile` commits, and runs the lockfile guard when the lockfile is staged. `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`), or any `mwccarm/`, `license.dat` or `dsd-*.exe` path. The commit hooks exit 0 without checks in a merge commit (`MERGE_HEAD` present), so `git merge main` works. Never use `--no-verify`.
  - The enforcement point is WS0's integration. It checks every non-merge commit in `main..<ref>` (local: `wsN-<name>`; cloud: `origin/<push target>` from `docs/status/cloud.md`) against `ownership.json` for the stream in that commit's trailer (the registry's stream if the trailer is missing), and refuses the merge on a violation.
  - Before `git tag phase0`, WS0 may write anywhere except WS1's entries, where it writes only the `packages/toolchain` and `packages/cli` skeletons, `packages/toolchain/src/api.ts` + `MockBuildService` and the `contracts/cli.md` draft; WS1, from hour zero, writes only its own entries.
  - `tools/ownership.json` rows switch on and off with git tags on main that only WS0 creates and pushes (`phase0`, `toolchain-ok`, `cp-a`, `cp-b`, `cp-c`, `m2`, `start-ws<n>`).
- **Shared-file exceptions.**
  - Append lines to `contracts/CHANGELOG.md` for your own contracts only (WS7 also for its `builtins.json` doc/example T0 changes). Existing lines never change.
  - Any stream may create a new `docs/adr/NNNN-*.md`. Never edit an existing ADR: WS0 numbers, edits and closes them.
  - WS7 may change only the `doc`/`example` fields of existing `contracts/builtins.json` entries.
  - Only WS0 appends to the `## Integration feedback` section that ends each `docs/status/wsN.md`: one `IF-<k>` entry per failure that only a local Windows run finds, closed later by `- IF-<k> resolved by <sha>`. The owning stream fixes open entries first and never edits that section. After fixing one, it adds `IF-<k> fixed in <sha>` to its progress notes above the heading (and a cloud stream pushes); WS0 re-runs the check and appends the resolved line.
  - Generated paths (`runtime/gen/**`, `packages/*/src/gen/**`, `docs/reference/**`, `fixtures/**/*.dsdb`) change only through their generator (`tools/gen-builtins.ts`, `tools/gen-opcodes.ts`, `tools/gen-docs`, `tools/gen-dsdb.ts`), in the same commit as the input change.
- **Root config and dependencies.**
  - Root config is WS0's: `package.json`, `tsconfig.json`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, the dotfiles, `.claude/**` and this file.
  - Each package owns its own `package.json`, `tsconfig.json`, `vitest.config.ts` and `CLAUDE.md` (in `runtime/`, WS3 owns the first three and WS2 owns `runtime/CLAUDE.md`). Cross-package imports go through `src/index.ts` or a declared subpath.
  - If you need a dependency, commit only your package's `package.json`. **Never commit `package-lock.json`**: only WS0 regenerates it, on Windows, with `npm install` while the lockfile exists, then `node tools/check-lockfile.mjs`. Never delete the lockfile while any `node_modules` exists: that silently drops the Linux platform entries the cloud clones need.
  - Worktrees and cloud clones run `npm install`, never `npm ci`.
- **Contract changes (7.4).**
  - **T0** (doc text, comments): the owner commits directly, with a CHANGELOG line.
  - **T1** (additive): in one commit, a minor version bump, the regenerated outputs, updated fixtures and a CHANGELOG entry. WS0 reviews within 24 h.
  - **T2** (breaking): an ADR co-signed by every affected owner and merged by WS0.
  - If a contract blocks you, write `docs/adr/NNNN-<title>.md` with a proposed answer, mark the workaround `// ADR-pending ADR-NNNN`, and keep going. Never work around a contract silently. Blockers are ADR drafts, not chat.
  - `builtins.json` ordinals are append-only. Changing the ids, names, kinds or signatures of function, variable or constant entries changes the ABI hash; alias and unsupported entries and doc/example text do not.
- **Git.**
  - Make small commits, and run your package's tests before each one: `npm test -w <pkg>`, or `mingw32-make -f runtime/Makefile.host test` (cloud: `make -f runtime/Makefile.host test`) / `make -j4` for the runtime.
  - Merge `main` into your branch daily (cloud: `origin/main`). Run `git restore package-lock.json` before every merge, because `npm install` rewrites it locally. Never rebase once WS0 has merged any of your commits.
  - In weeks 1-4, `ws2-*` and `ws4-*` may merge each other's branches (both run in the cloud: merge the other stream's push target from `docs/status/cloud.md`).
  - `origin` is the private GitHub repo. WS0 alone pushes `main`, the tags and the cloud stream lines `wsN-<name>` (created at launch, fast-forwarded at integration): `main` and the tags after every integration run and every tag, including `docs/status/checkpoint-N.md`. Cloud streams push only their own line, only via `tools/cloud/push.sh`. Local streams need no push: WS0 merges their branches from the shared repo. Nobody opens PRs or force-pushes.
- **Toolchain.** Never run `pacman`/`wf-pacman` after the `phase0` tag. Toolchain changes are WS1 ADRs (WS8's after the hand-off, WS0's in the gap between them), applied at a checkpoint when no builds are running.
- **Timeouts.** Every spawned process gets one: make, gcc, ndstool, grit, mmutil, emulators, py-desmume, Electron and Playwright.
- **Status.** Keep `docs/status/wsN.md` current: progress, spike results, leftovers and open `ADR-pending` markers.
  - At a checkpoint or a slot hand-off: commit, update the status file, then stop touching the branch until WS0 reports the merge.
  - A stream that has handed off keeps its paths, and later fixes run as short sessions of that stream. Only in the standard fallback do WS1's paths go through WS0 until WS8 starts.

## Capacity (7.2): hybrid mode; standard and upgraded are fallbacks only
- **Local** (Windows tools; 11.3 GB usable RAM; standard-mode limits): at most 4 Claude Code instances, WS0 plus slots 1-3 (WS1, then WS8 from CP-C; WS3; WS6). At most one Electron dev IDE and one emulator window machine-wide. Close Discord and Creative Cloud; the only browser tab is one claude.ai/code tab for steering cloud sessions (or use the mobile Code tab or the CLI).
- **Cloud** (no local RAM; one Claude Code cloud session per stream on the GitHub repo): WS2 and WS4 from the tag, WS5 and WS7 from CP-A, WS6b from CP-B. Anything that needs MSYS2, BlocksDS, grit/mmutil, py-desmume, an emulator or Electron runs locally, and WS0 checks it for the cloud streams at integration.
- **Usage limits:** peak ~4 local + 4-5 cloud sessions on one plan (open question 3). If limits bite, drop WS6b first, then WS7 and WS5 wait for a free cloud slot.
- **Fallbacks (7.2):** standard (all local, cap 4) when GitHub or cloud sessions are unavailable for more than a day, every push target is refused, or staggering cannot absorb the limits: WS0 records the switch in Status and re-plans at the next checkpoint, and a cloud stream continues locally with `git fetch origin; git worktree add -B wsN-<name> ..\DSDude-wsN origin/<push target>` plus the usual worktree setup (README 3). Upgraded (after a 32 GB upgrade): local cap 8 in memory-gated waves, one Electron dev IDE (WS6 only until CP-C), one emulator per worktree, and cloud streams may move home the same way.
- Before opening a dev IDE or an emulator, run `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue`. If the limit is reached, wait, or use `dsdude screenshot` headless. Close both after each test.
- Tests: `vitest run --pool=threads --maxWorkers=2`, never watch mode. Runtime builds: `make -j4` (`DSDUDE_MAKE_JOBS=4`) while more than two stream instances run, which is always locally in hybrid and standard mode. `buildRuntime({jobs})` defaults to 8; `dsdude` also takes `--jobs N`.
- **Memory gate** (local).
  - `tools/memsampler.ps1` logs available memory and commit charge every minute to `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\memsampler.log`.
  - `tools/checkpoint.ps1` reports the minimum and peak since the last checkpoint.
  - Add an instance only if the minimum available memory stayed above 1.5 GB.
- **Thermal** (local). ~16 concurrent agents once made this laptop hibernate on a critical thermal event (Kernel-Power 88). Stay within `make -j4` and `--maxWorkers=2`, and never fan out more local CPU work than that. After an event 88, run WS0 + 2 local instances (2.10).
- WS7 and WS6b test their Monaco glue and views with `@vitest/browser-playwright` in headless Chromium (after `npx playwright install chromium`). Only WS6 and WS0 open the Electron IDE, at checkpoints.

## Code rules (every instance, local and cloud)
- **Node and TypeScript.** Node 24 runs `.ts` natively (type stripping); npm 11 workspaces.
  - `dsdude` is not on PATH: run it as `npx dsdude ...` from the worktree or clone root (`packages/cli` declares the bin). Every brief writes plain `dsdude`.
  - Packages ship TypeScript source with no JS build, so code the CLI loads uses erasable syntax only (no enums, namespaces or parameter properties) and explicit `.ts` import extensions. Vitest (esbuild) accepts both, so a green test run does not prove it; `tsc -b` catches the syntax (`erasableSyntaxOnly`).
  - Type-check with plain `tsc -b`, with `-b` first (`--noEmit` fails with TS6310).
- **Line endings.** `.gitattributes` gives LF everywhere except CRLF for `*.ps1`/`*.cmd`, and marks the binary types.
- **Goldens and traces.** Golden and trace writers write binary (`"wb"`, Buffers), and comparisons strip `\r`.

## If you are a cloud session (`CLAUDE_CODE_REMOTE=true`, Linux)
- Follow `docs/kickoff/README.md` section 8 and your kickoff's "Cloud setup" block. The PowerShell env block, the Windows machine facts and the Windows shell rules below do not apply; the Code rules above do.
- **Start:** `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn` (repo config is not cloned), then `bash tools/cloud/start.sh` with a 10-minute tool timeout. It fetches history, tags and your stream line, runs the lockfile guard and `npm install`, and prints versions. Report failures rather than working around them.
- **Env:** Node 24 and npm 11 from `/opt/node24/bin` (the environment's setup script), `DSDUDE_HOME=$HOME/.dsdude`, `DSDUDE_SKIP_ELECTRON=1` (the root postinstall skips `install-electron`), `DSDUDE_MAKE_JOBS=4`, and `DSDUDE_PORT_BASE` = your base (only the WS7/WS6b browser tests use it). There is no MSYS2/Wonderful block. WS2/WS4 use Linux gcc and make; WS7/WS6b run `npx playwright install chromium`.
- **Branch and push:** your stream line is `wsN-<name>`. Push only with `bash tools/cloud/push.sh`, after every green batch, and never end a turn with unpushed work: idle VMs are reclaimed. If push.sh reports a NEW push target, record it as it says and tell the user. Never push `main` or tags, force-push or open PRs.
- **Daily:** `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`. Never rebase once WS0 has merged your commits.
- **Lockfile:** never stage, commit or delete `package-lock.json`, and never run `npm ci`. A new dependency is `npm install <pkg>@<exact> -w <own package>`, committing only that `package.json`. If `node tools/check-lockfile.mjs` fails, leave the lockfile alone, write `BLOCKER lockfile` in your status file, push and tell the user; meanwhile use `npm install --no-save <missing>@<version>`, never `--force`.
- **Never:** run Windows tools, emulators, py-desmume or Electron; edit `vendor/` or root config; install system packages (setup-script changes are WS0 ADRs); store secrets in environment variables; leave background processes running.
- **State and resume:** the VM is ephemeral, so your branch and `docs/status/wsN.md` are your only memory: keep the file current. Resume in the same session with "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/wsN.md." `/compact` works; `/clear` does not.
- **Integration feedback:** after every fetch, read `docs/status/checkpoint-N.md` and your `## Integration feedback` section on `origin/main` (`git show origin/main:<path>`), and fix open `IF-` entries first. Linux green alone is never done: WS0 re-runs your tests on Windows plus the local-only checks (MSYS2 gcc, real grit/mmutil, the DS build of the core, emulators, Electron).
- **Checkpoint:** commit, update the status file (with start.sh's version line), push, then wait until the user relays "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..." (README section 5), and do what the relay says: the VM may have been reclaimed meanwhile.

## Machine facts and gotchas (local Windows machine)
Local instances only. Windows 11 Home, Ryzen 7 5825U (16 threads), 11.3 GB usable RAM. One Claude instance uses ~350 MB working set and ~600 MB private, growing with context. The page file is already in use with one session open.

Env block (7.5). Set it in the worktree's PowerShell before starting `claude`:
```powershell
$env:DSDUDE_HOME = 'C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws<n>\.dsdude'   # WS0: C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude
$env:DSDUDE_PORT_BASE = '<port base from the table>'
$env:DSDUDE_MAKE_JOBS = '4'   # hybrid and standard mode always; upgraded mode while more than two stream instances run
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = "C:\msys64\opt\wonderful\bin;$env:PATH;C:\msys64\ucrt64\bin"   # ucrt64\bin last: host gcc and mingw32-make need it (section 2.4)
```
- **BlocksDS 1.24.0 (GCC 16.2.0)** is installed by WS1 on Day 0 through the Wonderful tarball into `C:\msys64\opt\wonderful`.
  - The SDK core is at `/opt/wonderful/thirdparty/blocksds/core`.
  - It counts as installed when both `C:\msys64\opt\wonderful\bin\wf-config` and `...\blocksds\core\tools\ndstool\ndstool.exe` exist.
- **bash spawns.** Always `C:\msys64\usr\bin\bash.exe -lc '<cmd>'` with `CHERE_INVOKING=1`.
  - Without it, the login shell runs `cd $HOME` and make fails with "No targets specified".
  - `-l` is mandatory, `BLOCKSDS` stays a POSIX path, and the PATH key is matched case-insensitively (`Path`/`PATH`).
  - PowerShell 5.1 mangles double quotes in native arguments, so inner bash strings use single quotes only.
- **Which shell tool.** Run build, test, toolchain, emulator and `dsdude` commands with the PowerShell tool, which passes the env block through unchanged. The Bash tool is Git Bash, and it changes three things:
  - it rewrites POSIX-looking arguments and env values for native programs (verified: `BLOCKSDS=/opt/wonderful/...` reaches node as `C:/Program Files/Git/opt/wonderful/...`);
  - it puts Git's own `/mingw64/bin` DLLs ahead of `C:\msys64\opt\wonderful\bin`;
  - it makes `mingw32-make` run recipes with Git's `sh.exe`, while from PowerShell they run with cmd.exe.

  If you must use the Bash tool for these commands, prefix them with `MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*'` and put `/c/msys64/opt/wonderful/bin` first on PATH. The Bash tool is fine for git, grep and reading files. In PowerShell, `timeout` is `C:\Windows\System32\timeout.exe`, which only sleeps: time-box with the tool's timeout parameter instead.
- **Host C** (`C:\msys64\ucrt64\bin\gcc.exe` 15.2, `mingw32-make`) needs `C:\msys64\ucrt64\bin` on PATH. Without it, gcc exits 1 with no message because cc1 cannot load libmpfr-6.dll.
  - UBSan works only in trap mode, and a trap exits with 0xC000001D.
  - Both targets build the portable core with `-std=c11 -fwrapv -fno-strict-aliasing -funsigned-char`, with no floats. Only the DS platform files (`runtime/platform/ds/`) use `-std=gnu11`, because the libnds headers need GNU `asm` (WS3, 2026-09-26; `contracts/runtime-artifact.md`). `runtime/Makefile.host` builds with MSYS2 gcc here and Linux gcc in the cloud, with identical flags `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char`; both run the same goldens at every integration.
- **Console tools** (ndstool, grit, mmutil) need `C:\msys64\opt\wonderful\bin` first on PATH, or they exit 0xC0000135 (missing DLL) with no output.
  - Spawn them with `windowsHide` and a timeout, and always pass `-7` explicitly.
  - Delete partial outputs, and keep build paths under 250 chars.
- **Emulators** spawn with `stdio:'pipe'` and **without** `windowsHide`, which would hide their window.
  - melonDS 1.1 is the default. It is a portable build with `melonDS.toml` beside the exe and ships with no key bindings. It lives in `<DSDUDE_HOME>\emulators\melonDS-1.1\`.
  - DeSmuME 0.9.13 is copied from `C:\Users\zache\Downloads\desmume-0.9.13-win64\` to `<DSDUDE_HOME>\emulators\desmume-0.9.13\`.
  - Both block-buffer stdout on a pipe in ~4 KB blocks. The runtime therefore follows `DSD|READY`, `DSD|ERR` and `DSD|STAT` with a >= 5 KB flush pad of `DSD|PAD|` lines, which parsers drop.
  - Stop = `taskkill /PID`, wait up to 2 s, then `/F`. Wait for exit before rewriting `melonDS.toml`, which melonDS rewrites on exit.
- **Node here** is 24 with npm 11.13 (the Code rules above apply).
  - There is no VS C++ toolchain, so no node-gyp builds.
  - The root `postinstall` (`tools/postinstall.mjs`) runs `install-electron`, which provides `node_modules/electron/path.txt`, unless `DSDUDE_SKIP_ELECTRON=1`. The first `npm install` in a worktree downloads Electron: give it a 10-minute tool timeout.
- **Python.** `python` is the Microsoft Store CPython 3.13.14 (also `py -3.13`; ignore the 3.10 install). py-desmume 0.0.9 lives in its user site, installed by WS1 at hour zero with the user present; Pillow is already there.
- **Git and line endings.**
  - System git has `core.autocrlf=true`. The repo sets `core.autocrlf false`, `core.longpaths true`, `extensions.worktreeConfig true` and `core.hooksPath .githooks`.
  - `.ps1` files are ASCII-only (or UTF-8 with BOM). Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI, and an em dash inside a double-quoted string then breaks parsing.
- **Paths.** Desktop and Documents are OneDrive-redirected. The repo stays on the Desktop by decision (sync inactive); nothing else goes there.
  - If `OneDrive.exe` runs while the repo is under `%OneDrive%`, `tools/checkpoint.ps1` and `dsdude doctor` warn: pause the instances and turn Desktop sync off (`node_modules`, `.git` and `.dsdude` would lock).
  - User projects default to `%USERPROFILE%\DSDudeProjects`.
  - Build output goes to `<DSDUDE_HOME>\build\<project-hash>` (default `%LOCALAPPDATA%\DSDude\build\<project-hash>`), where `<project-hash>` is the first 16 hex digits of the SHA-256 of the lower-cased absolute project path (section 3.2).
- **mwccarm and dsd** live in `vendor/` (gitignored except `vendor/README.md`, never pushed) and are **not part of the pipeline**.
  - mwccarm hangs silently without `LM_LICENSE_FILE` and is not redistributable.
  - dsd only handles decompiled retail ROMs.
  - NitroSDK `.lcf.template` files never enter git.

## Verifying without eyes
You cannot see emulator or IDE windows. Verify in these ways:
1. **Logs.** `DSD|` lines (READY/LOG/ERR/MEM/STAT/EXIT, contract C8), captured by `dsdude play` / EmulatorManager. They arrive live because of the flush pad, or at graceful Stop.
2. **Screenshots.** `dsdude screenshot <rom> --frames N [--keys file] --out dir` writes top and bottom PNGs through py-desmume 0.0.9 with `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy`. Open the PNGs with the image-capable Read tool.
   - A definition of done about what a screen shows means the PNG at frame N matches a golden PNG or passes a stated check.
   - py-desmume needs BlocksDS-built ROMs. Detect a hung ROM from the screenshot content, not from `is_running()`.
3. **Runtime core.** Use `dsdude-host` JSONL traces and PNG frames, always with `--seed N`.

Cloud sessions have only 3 and browser-test output; WS0 runs 1 and 2 locally and reports failures as `IF-` entries. Ask the user only when a screenshot is ambiguous.
