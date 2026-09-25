# WS0 kickoff: Lead: foundation, contracts, integration

You build the DSDude monorepo, the minimum-viable contracts and the seed fixtures in a 2-day Phase 0, so every other stream can start in isolation, and you end Phase 0 with `git tag phase0`. After the tag you stay on as the persistent local integrator on `main` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`. You merge the local streams' worktree branches and the cloud streams' `origin` branches daily with `tools/checkpoint.ps1`, enforce `tools/ownership.json`, regenerate the lockfile, run checkpoints, push `main` and the tags to `origin`, and draft every ADR with a recommended answer for the user to decide (PLAN.md sections 2.10, 6 WS0 and 7.2).

**Where the documents are today.** The repo is this folder, `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\`, and it stays here (user decision, 2026-09-25; section 2.10: Desktop is OneDrive-redirected, but nothing syncs). It holds PLAN.md, CLAUDE.md, docs/kickoff/** and docs/research/** (README.md, 01-toolchain.md .. 06-idestack.md, 07-design-panel-summary.md, verification.md), plus mwccarm\ and dsd-windows-x86_64.exe. On Day 0 the user runs `git init` in place, moves mwccarm\ to vendor\mwccarm\ and dsd-windows-x86_64.exe to vendor\dsd\dsd-windows-x86_64.exe inside the same folder, commits the docs with a minimal `.gitignore`, and pushes to a private GitHub repo (Setup).

## Paste this to start

First session (Phase 0, Day 1):

```text
You are workstream **WS0: Lead: foundation, contracts, integration** on DSDude, a GameMaker-like Nintendo DS IDE. Operating mode: hybrid (local integrator on `main`; the CLAUDE.md Status block is authoritative). You work on branch `main` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` (no worktree of your own) as the local integrator of hybrid mode; `origin` is the private GitHub repo. Read `docs/kickoff/ws0.md` first, then `CLAUDE.md`, `docs/kickoff/README.md` section 8 (cloud sessions) and the `PLAN.md` sections the kickoff cites (1, 2.5, 2.8, 2.10, 3.2-3.4, 4, 5, 6 WS0, 7.1-7.5, 8 phase0, 9, 10; sections 1, 2.8 and 3.2-3.3 can wait until Day 2), not the whole file. Once they exist, also read `contracts/README.md`, `contracts/CHANGELOG.md` and your contract files (C1, C2, C9, C13 and the Phase-0 drafts of C4, C5, C6, C8, C10, C12, C14). Before the phase0 tag you may write anywhere except WS1's entries (beyond the `packages/toolchain` and `packages/cli` skeletons, `api.ts` + `MockBuildService` and the `cli.md` draft); after it, only your `tools/ownership.json` rows and the exceptions listed in the kickoff. Never run `pacman`/`wf-pacman`; put a timeout on every process you spawn; use `vitest run --pool=threads --maxWorkers=2`, no watch mode. Push only `main` and annotated tags (`git push origin main --follow-tags`), plus three cloud pushes: a new stream line at a cloud launch (task 9), a fast-forward of `wsN-<name>` to a merged cloud tip (task 8), and deleting the probe branches (task 3); never force. Keep `docs/status/ws0.md` current and stop at the end of each Phase-0 day for the user's approval. The user's Day-0 answers: Location: stay in place at `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` (no move, no pointer README; OneDrive sync inactive). BlocksDS install consent: given at WS1's launch by approving its prompts. Mode: hybrid (local WS0 + WS1/WS3/WS6/WS8 at standard-mode limits; cloud WS2, WS4, WS5, WS7, optional WS6b). Usage limits for ~4 local + 4-5 cloud sessions confirmed: <yes/no>. Names: confirmed (DSDude / DSS `.dss` / DSDB). GitHub origin: <https://github.com/<user>/dsdude.git>, private; Claude GitHub App installed: <yes/no>. Public releases and the unsigned installer: decided by M6. Record them under "Day-0 answers" in docs/status/ws0.md in your first commit. If the origin URL is missing, ask before task 2; if usage limits are unconfirmed, ask before the tag launches. Begin with task 1 in docs/kickoff/ws0.md.
```

Phase 0 resume (Day 2, or after a restart or compaction before the tag):

```text
You are workstream **WS0: Lead: foundation, contracts, integration** on DSDude, on branch `main` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`, in Phase 0 before the `phase0` tag. Operating mode: hybrid (local integrator on `main`; the CLAUDE.md Status block is authoritative). Read `docs/kickoff/ws0.md`, `docs/status/ws0.md` and `git log --oneline -30`, then the PLAN.md sections that the next open task cites. Continue with the first task in docs/status/ws0.md that is not marked done; do not redo finished tasks. Before the tag you may write anywhere except WS1's entries. Never run pacman/wf-pacman; put a timeout on every process you spawn; use `vitest run --pool=threads --maxWorkers=2`. Stop at the end of the day for the user's approval.
```

Later sessions (after a restart or compaction, any time after the tag):

```text
You are workstream **WS0: Lead: foundation, contracts, integration** on DSDude, on branch `main` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`. Operating mode: hybrid, unless the CLAUDE.md Status block records a fallback. Read `docs/kickoff/ws0.md`, `docs/status/ws0.md`, `docs/status/cloud.md`, the newest `docs/status/checkpoint-N.md`, `contracts/README.md` and `contracts/CHANGELOG.md`. Then run the daily integration (task 8: local branches and cloud `origin` branches, then push `main` and the tags) and carry on with the open items in `docs/status/ws0.md`. Put a timeout on every process you spawn; never run `pacman`/`wf-pacman`.
```

## When this stream starts

- **Hybrid mode (the plan):** local, Day 0 (Phase 0, 2 days), then a persistent instance on `main` for the whole project; counts as one of the 4 local instances. The same holds in both fallbacks (below).
- **Depends on:** the user's Day-0 steps (section 7.1 and Setup below): the Day-0 answers (location, mode and names are settled; the `origin` URL and the usage-limit confirmation remain); `git init` in place with the shared repo config and a minimal `.gitignore`; the vendor binaries moved inside the folder; the first commit pushed to the private GitHub repo, with the Claude GitHub App installed on it.
- **Gate you own:** `phase0` (section 8): the minimum-viable contracts committed with versions; `npm install && npm run check && npm test` green in a clean clone (`C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean`); both hooks proven, merge commits included; Makefiles and hooks check out LF; `docs/kickoff/wsN.md` for every stream; the cloud pieces of task 3 on `origin/main`, and either cloud-probe step 3 green or the fallback recorded; `git tag phase0`.
- **Gates you watch:** WS1's `toolchain-ok` (day 1-3), the cloud probe (Day 1), CP-A (D+3), CP-B = M0 (D+7), CP-C = M1 (D+14) (section 7.3).
- **If the tag slips:** if day 3 ends without the tag, WS0 tags `phase0` on main's last green commit anyway, so the ownership rows activate. It lists the missing items in `docs/status/ws0.md` and `contracts/README.md` and delivers each as an ADR (ADR-0002 onward) within 48 hours. The user then launches the streams due at the tag.

You run the launches below. Before each local launch, run `tools/checkpoint.ps1 -MemoryOnly` for the memory gate (task 3); cloud launches use no local RAM. Before every launch, tag `start-ws<n>` on main (task 3), update the `CLAUDE.md` Status block, push, and tell the user which stream starts next; a cloud launch also gets its stream line and registry line (task 9). WS1's hour-zero launch is exempt from the memory gate; the sampler starts on Day 1.

**Hybrid mode (section 7.2).** Local streams need Windows tools (MSYS2, BlocksDS, emulators, Electron, NSIS) and hold slots 1-3 at the standard-mode limits: WS1, WS3, WS6, then WS8. Cloud streams run as Claude Code cloud sessions, each in its own environment `dsdude-wsN`, and use no local RAM: WS2 (host build with Linux gcc), WS4 (pure TypeScript), WS5 (pure-TS parts; real grit/mmutil tests skip without `ToolPaths`), WS7 (headless, browser tests in headless Chromium) and the optional WS6b (`packages/editor-core`, mock-host views; otherwise WS6 builds the editors). Whatever needs Windows (the DS build of the core, real grit/mmutil, MSYS2 gcc, emulators, Electron) is checked locally by you or the local streams (task 8).

| When | Slot 1 | Slot 2 | Slot 3 | Cloud | Local / cloud |
|---|---|---|---|---|---|
| Day 0 | WS1 | - | - | probe on Day 1 | 2 / 0 |
| Tag D (day 2) | WS1 | waits for `toolchain-ok` | WS6 | WS2, WS4 | 3 / 2 |
| `toolchain-ok` (day 1-3) | WS1 | WS3 | WS6 | WS2, WS4 | 4 / 2 |
| CP-A (D+3) | WS1 | WS3 | WS6 | + WS5, WS7 | 4 / 4 |
| CP-B = M0 (D+7) | WS1 | WS3 | WS6 | + WS6b | 4 / 5 |
| CP-C = M1 (D+14) | WS8 | WS3 | WS6 | unchanged | 4 / 4-5 |
| Later | WS8 | free after WS3's DoD, for short local fix sessions | WS6 | streams end at their DoD | max 4 / 5 |

Hybrid uses upgraded mode's milestone criteria (M0 includes IDE Play and the selftest ROM), its checkpoints (CP-A D+3, CP-B D+7, CP-C D+14, then weekly), its freezes (CP-A: C11, the C12 panel API + fixtures/ide/mock-host, C4 BuildService; CP-B: C7 LanguageServiceHost, the C12 preview API) and its ownership events. The standard-mode `cp-b` holding row for WS1's paths is not created. At CP-C WS1 commits its last work, you merge, and slot 1 continues as WS8 in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8` on branch `ws8-release`, with WS1's leftovers. WS3 keeps slot 2 to its definition of done, including the M4 stress check and the hardware notes. If usage limits bite, drop WS6b first; then WS7 and WS5 wait for a free cloud slot.

| | phase0 | toolchain-ok | M0 | M1 | M2 | M3 | M4 | M5 | M6 (0.1) |
|---|---|---|---|---|---|---|---|---|---|
| **Hybrid** | day 2 | day 1-3 | wk 2 | wk 3 | wk 4-5 | wk 6-7 | wk 8-9 | wk 10-11 | wk 12-14 |
| Standard (fallback) | day 2 | day 1-3 | wk 2 | wk 4-5 | wk 7-8 | wk 11-12 | wk 14-16 | wk 15-17 | wk 16-20 |
| Upgraded (fallback) | day 2 | day 1-3 | wk 2 | wk 3 | wk 4-5 | wk 6 | wk 8 | wk 9-10 | wk 12 |

**Fallbacks (section 7.2).** Switch to standard mode when GitHub or cloud sessions are unavailable for more than a day, every push target is refused, or staggering cannot absorb the usage limits: record it in the CLAUDE.md Status block and re-plan at the next checkpoint. A cloud stream then continues locally with `git fetch origin; git worktree add -B wsN-<name> ..\DSDude-wsN origin/<push target>`, followed by the usual worktree setup (`docs/kickoff/README.md` section 3). Standard mode runs every stream locally in three slots per section 7.2's wave table: M0 is CLI-only (the IDE criterion moves to M3 and the selftest criterion to M1), WS1 hands slot 1 to WS3 at M0, and you add the WS1 holding row `from: cp-b, until: start-ws8` (task 3). After a RAM upgrade, upgraded mode applies: the local cap becomes 8, and cloud streams may move home the same way.

## Setup

**Day-0 checklist (the user, ~1 h; section 7.1 and `docs/kickoff/README.md` sections 1 and 8):**

1. Fill in the Day-0 answers line of the WS0 start prompt before pasting it. Location, mode and names are settled. Add the `origin` URL (step 3) and confirm that your Claude plan covers ~4 local + 4-5 cloud concurrent sessions (open question 3).
2. Initialise the repo in place, in Windows PowerShell 5.1:

   ```powershell
   Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
   if (Test-Path .git) { throw 'Already a git repo: stop and ask WS0' }
   git init -b main
   git config core.autocrlf false; git config core.longpaths true
   git config extensions.worktreeConfig true; git config core.hooksPath .githooks
   # Minimal .gitignore BEFORE the first commit (LF, ASCII). WS0 replaces it on Day 1 and keeps vendor/* ignored.
   $ignore = 'vendor/*', '!vendor/README.md', '/mwccarm/', '/dsd-windows-x86_64.exe', '.claude/settings.local.json',
             'node_modules/', '.dsdude/', '/dist/', '/build/',
             '*.nds', '*.elf', '!/fixtures/**/*.nds', '!/fixtures/**/*.elf', '!/runtime/dist/*.elf'
   Set-Content -Path .gitignore -Encoding ascii -NoNewline -Value (($ignore -join "`n") + "`n")
   New-Item -ItemType Directory -Force vendor\dsd -ErrorAction Stop | Out-Null
   Move-Item mwccarm vendor\mwccarm -ErrorAction Stop
   Move-Item dsd-windows-x86_64.exe vendor\dsd\ -ErrorAction Stop
   if ((Test-Path mwccarm) -or (Test-Path dsd-windows-x86_64.exe) -or -not (Test-Path vendor\mwccarm\1.2\license.dat) -or -not (Test-Path vendor\dsd\dsd-windows-x86_64.exe)) { throw 'vendor move incomplete: close programs using these files and rerun the two Move-Item lines' }
   git add .gitignore PLAN.md CLAUDE.md docs
   git commit -m 'Day 0: planning documents and .gitignore'
   if (git ls-files vendor) { throw 'vendor/ is tracked: do not push' }
   git status --short --ignored vendor   # expect only '!!' lines
   ```

   `/dist/` and `/build/` are root-anchored because `runtime/dist/**` and `fixtures/build/**` are tracked. The first commit carries the `.gitignore` because the repo goes to GitHub and mwccarm is proprietary; it also gives `git worktree add` a base. `-ErrorAction Stop` matters because a `Move-Item` error is otherwise non-terminating in Windows PowerShell 5.1 (a file held open by another program would stay at the root); the root-level `/mwccarm/` and `/dsd-windows-x86_64.exe` ignore lines are the second line of defence. `.claude/settings.local.json` holds each instance's own "don't ask again" answers: the user's global excludes line `**/.claude\settings.local.json` does not match it, because git reads the backslash as an escape.
3. Create the private GitHub repo. This is an outward-facing action the user performs; no instance does it. Pick one route:

   ```powershell
   # Route A, browser (gh is not installed): github.com/new -> dsdude, Private, no README/license/.gitignore
   git remote add origin https://github.com/<user>/dsdude.git
   git push -u origin main            # Git Credential Manager signs you in once
   # Route B, GitHub CLI (open a new PowerShell window after winget)
   winget install --id GitHub.cli -e
   # in the new window:
   Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
   gh auth login --hostname github.com --git-protocol https --web
   gh repo create dsdude --private --source . --remote origin --push
   # Both routes: confirm no vendor/ file is anywhere in GitHub's history
   git fetch origin; if (git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md') { throw 'vendor/ is on GitHub: delete the repo' }
   ```

4. Install the Claude GitHub App at `https://github.com/apps/claude/installations/new` with **Only select repositories** set to `dsdude` (GitHub grants its read/write permissions with no subset; without the App, `claude --cloud` uploads a bundle instead of cloning). Before the probe (Day 0 or 1), sign in at claude.ai/code, authorize GitHub and create the five cloud environments `dsdude-ws2`, `-ws4`, `-ws5`, `-ws7`, `-ws6b` (README section 8).
5. Keep Discord and Creative Cloud closed; one claude.ai/code tab may stay open for steering cloud sessions.
6. Launch WS0 (below), then WS1 from `docs/kickoff/ws1.md`, and stay present for WS1's ~30 min install. Launching WS1 and approving its prompts is the install consent. Also answer WS0's permission prompts until task 1 has committed `.claude/settings.json` (the shared allowlist).

**Launching WS0.** WS0 has no worktree. In a PowerShell window:

```powershell
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
git config --worktree dsdude.ws WS0
# npm install only once your Day-1 package.json exists; never npm ci
```

Then paste this env block (section 7.5, with WS0's values), and start `claude`:

```powershell
# Per-instance env block (PLAN.md section 7.5). Set in the worktree's PowerShell before starting `claude`.
$env:DSDUDE_HOME = 'C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude'
$env:DSDUDE_PORT_BASE = '5100'   # electron-vite dev server = base; Vitest browser mode / Playwright = base+1..base+9
$env:DSDUDE_MAKE_JOBS = '4'   # hybrid and standard mode always; upgraded mode while more than two stream instances run (buildRuntime default is 8)
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = "C:\msys64\opt\wonderful\bin;$env:PATH;C:\msys64\ucrt64\bin"   # ucrt64\bin last: host gcc and mingw32-make need it (section 2.4); without it gcc exits 1 with no message
```

**Stream worktrees.** The user creates each local stream's worktree (`git worktree add ..\DSDude-ws<n> -b ws<n>-<name>`, then `git config --worktree dsdude.ws WS<n>` and `npm install`) from the Setup section of its `wsN.md` and `docs/kickoff/README.md` section 3. You say when. Cloud streams have no worktree: the user opens a cloud session on the stream line you push (task 9; README section 8).

## Owned paths and contracts

**Owned paths** (your rows in `tools/ownership.json`, section 3.4):
`package.json`, `package-lock.json`, `tsconfig.json` (root solution), `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `.gitattributes`, `.editorconfig`, `.npmrc`, `.gitignore` (including `!vendor/README.md`), `vendor/README.md`, `README.md`, `LICENSE*`, `runtime/LICENSE`, `PLAN.md`, `CLAUDE.md`, `CODEOWNERS`, `.githooks/**`, `.claude/**`, `.vscode/**`, `tools/ownership.json`, `tools/tsconfig.json`, `tools/gen-builtins.ts`, `tools/gen-opcodes.ts`, `tools/gen-dsdb.ts`, `tools/check-ownership.ts`, `tools/check-lockfile.mjs`, `tools/postinstall.mjs`, `tools/cloud/**`, `tools/checkpoint.ps1`, `tools/memsampler.ps1`, `tools/adr-pending.ts`, `tools/phase0/**`, `docs/adr/**` (any stream may create a new docs/adr/NNNN-*.md; WS0 numbers, edits and closes ADRs), `docs/research/**` (README.md, 01-toolchain.md .. 06-idestack.md, 07-design-panel-summary.md, verification.md), `docs/kickoff/**`, `docs/status/checkpoint-*.md`, `docs/status/cloud.md`, `fixtures/runtime-core/flappy-nitrofs/**` (from the tag: you build it locally with grit/mmutil for the cloud stream WS2), `fixtures/assets/golden/**` (from the tag: you generate it locally with py-desmume for the cloud stream WS5's screenshot check), `contracts/README.md`, `contracts/CHANGELOG.md` (any contract owner may append entries for its own contracts, and WS7 under the C2 `builtins.json` section; existing lines never change), `contracts/builtins.json` (append-only; WS7 may change only doc/example fields), `contracts/project-format.md`, `contracts/diagnostics.md`, `packages/project-format/**`, `packages/dsdb/**` and `packages/ipc-contract/**` until the phase0 tag (then WS4 and WS6), `docs/status/ws0.md`. Before the phase0 tag WS0 may write anywhere except WS1's entries (below): package skeletons and their CLAUDE.md, packages/asset-pipeline/src/preview.ts, seed fixtures and samples.

**What you may not touch, and how it is enforced.** Before the tag, stay out of WS1's entries except the `packages/toolchain` and `packages/cli` skeletons, `packages/toolchain/src/api.ts` + `MockBuildService` and the `contracts/cli.md` draft, which WS1 takes by merging `main`. After the tag, you commit only to your rows, plus these exceptions:
- generated outputs (`runtime/gen/**`, `packages/*/src/gen/**`, `fixtures/**/*.dsdb`) in a commit that changes the generator's input;
- `chore(deps): regenerate lockfile`;
- the contract files of an owner that has not started yet (section 5.1: "Until an owner starts, WS0 holds its contract files and merges T1 changes to them");
- `IF-` entries appended to the `## Integration feedback` section at the end of any stream's `docs/status/wsN.md` (append-only, task 8);
- in the standard-mode fallback only, fixes to WS1's paths and toolchain ADRs between WS1's hand-off (M0) and WS8's start.

Encode these exceptions as `from`/`until` rows and shared-file rules for WS0 in `tools/ownership.json` rather than bypassing the hook. `.githooks/pre-commit` runs Biome and `tools/check-ownership.ts`, which reads the stream from `git config --worktree dsdude.ws` (WS0 here). `.githooks/commit-msg` adds `DSDude-WS: WS0` and rejects a staged `package-lock.json` in any other commit. `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`), or any `mwccarm/`, `license.dat` or `dsd-*.exe` path. Both commit hooks skip merge commits (task 3). Your own integration run is the real enforcement point for everyone else, local or cloud.

**Contracts** (section 5.1). Each contract file carries a `version` header and a "how to change me" section (formats in task 4), and gets its own section in `contracts/CHANGELOG.md`.

| Contract | Files | Your role |
|---|---|---|
| C1 Project format | `packages/project-format`, `contracts/project-format.md` | owner |
| C2 builtins table | `contracts/builtins.json` | owner, append-only; WS7 fills doc/example fields. You also write the Phase-0 container + `contracts/opcodes.json` (29 stable opcodes) and `packages/dsdb`, which pass to WS4 at the tag |
| C4 types | `packages/toolchain/src/api.ts` + `MockBuildService` | Phase-0 author; owner WS1 |
| C5 channel list + zod stubs | `contracts/ipc.md`, `packages/ipc-contract` | Phase-0 author; owner WS6 from the tag |
| C6 v0.1 | `contracts/language.md`, `contracts/events.md`, `fixtures/conformance` v0 | Phase-0 author; owner WS4 |
| C8 protocol draft | `contracts/log-protocol.md` | Phase-0 author; owner WS2 |
| C9 Diagnostics shape | `contracts/diagnostics.md` | owner |
| C10 CLI draft | `contracts/cli.md` | Phase-0 author; owner WS1 |
| C12 preview types | `packages/asset-pipeline/src/preview.ts` | Phase-0 author; owner WS5 |
| C13 seed | `contracts/runtime-limits.json` | Phase-0 author; owner WS2 |
| C14 Phase-0 fixtures | `samples/minimal`, `samples/flappy` v0, `fixtures/bytecode/hello.dsda\|.dsdb`, `fixtures/assets/`, `fixtures/conformance/` v0 | producer |

You consume no contract. You review every T1 change within 24 hours.

## Ordered tasks

Commit small and often on `main`. `docs/status/ws0.md` starts with a checklist of tasks 1-7 and their sub-bullets; mark each one todo, in progress or done (with the commit SHA), and update it at every commit. Push `main` to `origin` at the end of each Phase-0 day and before the cloud probe.

At the end of each Phase-0 day, write an end-of-day report in `docs/status/ws0.md`, then stop. The user approves, or answers in chat.
- Day 1: tasks 1-4 marked done with SHAs; the `npm run check && npm test` output; the spike 1 and 13 results; the cloud-probe results (or when it runs); confirmation that WS1 was told to merge `main`; open questions for the user.
- Day 2: every definition-of-done bullet with its evidence (command and result); the contract versions table; the streams to launch next, local and cloud; anything deferred as an ADR.

Priority on Day 1: WS1 needs the `packages/toolchain` and `packages/cli` skeletons, `api.ts` and the `cli.md` draft early, so commit tasks 1-2 and the C4/C10 part of task 4 (with the `Diagnostic` and minimal `Project` types it needs) before the rest. Tell WS1 when they are on `main`. Then finish task 3, including its cloud pieces, so the user can run the cloud probe on Day 1 (early Day 2 at the latest).

### Phase 0, Day 1

**Task 1. Line endings and repo hygiene (first hour; section 3.4).**
- `.gitattributes`, one pattern per line:
  ```
  * text=auto eol=lf
  *.sh text eol=lf
  .githooks/* text eol=lf
  Makefile* text eol=lf
  *.mk text eol=lf
  *.ps1 text eol=crlf
  *.cmd text eol=crlf
  ```
  followed by one `binary` line each for `*.dsdb *.grf *.bin *.nds *.elf *.png *.wav *.xm *.mod *.it *.s3m *.sav *.zip`.
- `.editorconfig` with `end_of_line = lf` (and crlf for `*.ps1`/`*.cmd` to match); `.npmrc` with `save-exact=true`, `fund=false`, `audit=false`.
- Replace the Day-0 `.gitignore` with the full list: `node_modules/`, `dist-types/`, `*.tsbuildinfo`, `coverage/`, `test-results/`, `playwright-report/`, `__pycache__/`, `.dsdude/`, `/samples/*/build/`, `/samples/*/*.nds`, `/samples/*/*.elf` (BlocksDS Makefile output), `/runtime/build/`, `/runtime/build-host/` (WS2's `Makefile.host` output), `/apps/ide/out/`, `/apps/ide/dist/`, `vendor/*` and `!vendor/README.md`. Keep the Day-0 lines `/mwccarm/`, `/dsd-windows-x86_64.exe`, `.claude/settings.local.json`, `/dist/`, `/build/`, `*.nds`, `*.elf`, `!/fixtures/**/*.nds`, `!/fixtures/**/*.elf` and `!/runtime/dist/*.elf`. `vendor/*` stays ignored for good: the repo is on GitHub and mwccarm is proprietary. `runtime/dist/**` and `fixtures/**` stay tracked (streams cannot edit this file, so the list must be complete).
- `vendor/README.md`: what lives in `vendor/` (mwccarm/, dsd/, tools-pack staging, emulator zips); that mwccarm hangs silently without `LM_LICENSE_FILE`; that neither mwccarm nor dsd is in the pipeline (section 2.2); and that nothing from mwccarm or NitroSDK enters git, GitHub or the product (section 2.11).
- `.claude/settings.json`, first version: the shared permission allowlist and the `npm ci` deny rule of task 3 (without the cloud rules and SessionStart hook, which task 3 adds). Committing it now spares the user most permission prompts for the rest of Day 1.
- Replace the Status bullets in `CLAUDE.md` with: planning done (`PLAN.md` v1.2, verified); Phase 0 in progress (WS0 on `main`, WS1 installing BlocksDS; `git tag phase0` releases the other streams); the repo is this folder (stay in place), with `origin` = the private GitHub repo; operating mode: hybrid, with the usage-limit answer from the Day-0 answers. Delete the "documentation only" sentence.
- Run `git add .gitattributes .editorconfig .npmrc .gitignore vendor/README.md CLAUDE.md .claude/settings.json docs/status/ws0.md` (the status file carries the Day-0 answers), then `git add --renormalize .` (which restages only tracked files). Check that `git ls-files vendor` prints only `vendor/README.md` and that `git status` shows no other `vendor/` files, then commit and (once `origin` exists) `git push origin main`.

**Task 2. The monorepo (section 2.5; spike 13, WS0 part).**
- Root `package.json`: `"private": true`, `"type": "module"`, `"license": "MIT"`, workspaces `apps/* packages/* tools/* runtime`, `"postinstall": "node tools/postinstall.mjs"`, and scripts `check` (Biome and `tsc -b`; it gains the generator byte-identical checks of task 6 on Day 2) and `test` (`vitest run --pool=threads --maxWorkers=2`).
- `tools/postinstall.mjs` (plain JS): runs `install-electron` with inherited stdio and its exit code, unless `DSDUDE_SKIP_ELECTRON=1`, which only cloud clones set. Electron 42+ has no postinstall of its own.
- Packages ship TypeScript source with no JS build. Every skeleton `package.json` sets `"type": "module"`, except `apps/ide`, whose Electron main and preload stay CommonJS (ws6.md section 9). Each skeleton also has:
  - `"exports": {".": "./src/index.ts"}`, plus declared subpaths such as `./node` for `project-format`;
  - a `"license"` field: `MIT`, or `Zlib` for `runtime`;
  - a `"test": "vitest run --pool=threads --maxWorkers=2"` script, so `npm test -w <pkg>` works;
  - its own `vitest.config.ts` (`defineProject({ test: { name: '<folder>' } })`);
  - a `tsconfig.json` extending `../../tsconfig.base.json`, with references to the packages it imports.

  Relative imports carry explicit `.ts` extensions, because the CLI runs under Node 24 type stripping. `packages/cli/package.json` declares `"bin": { "dsdude": "src/main.ts" }`, whose first line is `#!/usr/bin/env node`, so `npx dsdude <args>` works from any worktree root after `npm install`.
- Pre-install the whole pinned stack of section 2.5 with exact versions into the packages that use it, so no stream edits another's `package.json`. For example: Electron, electron-vite, Vite, @vitejs/plugin-react, React and react-dom, dockview-react, @tailwindcss/vite, @playwright/test, zustand, immer, Tailwind, radix-ui, PixiJS, chokidar, electron-builder and electron-updater in `apps/ide`; monaco-editor in `apps/ide` and `packages/monaco-dss`; zod in `packages/project-format` and `packages/ipc-contract`; pngjs, wavefile, @audio/decode-wav and @audio/decode-mp3 in `packages/asset-pipeline`; tree-kill in `packages/toolchain`; @vitest/browser-playwright where browser tests run; TypeScript, @types/node, vitest and @biomejs/biome at the root. Check each pin against docs/research/verification.md claim 8.
- **Lockfile (cloud clones install it on Linux).** Verified 2026-09-25 (npm 11.13, Node 24.16, Linux simulated with `--os/--cpu/--libc`): a clean Windows-generated lockfile records the linux-x64 glibc variant of every native family (rollup, esbuild, biome, TS 7, tailwind oxide, lightningcss, `@napi-rs/lzma`), but a lockfile deleted while `node_modules` exists comes back without 11 `@tailwindcss/oxide-*` entries, which breaks Tailwind on Linux for good. Rules:
  - Regenerate only on Windows, with `npm install` while the lockfile exists (safe for adds, bumps and plain installs).
  - Never delete the lockfile while any `node_modules` exists. A full rebuild is `Remove-Item -Recurse -Force node_modules, apps\*\node_modules, packages\*\node_modules, tools\*\node_modules, runtime\node_modules, package-lock.json -ErrorAction SilentlyContinue; npm install`.
  - `tools/check-lockfile.mjs` guards it in commit-msg (lockfile staged), in `checkpoint.ps1` before pushing `main`, and in `tools/cloud/start.sh`/`push.sh`:
    ```js
    // Fails if any optionalDependency in package-lock.json has no lock entry (a lock rebuilt over node_modules).
    import { readFileSync } from "node:fs";
    const pkgs = JSON.parse(readFileSync(process.argv[2] ?? "package-lock.json", "utf8")).packages;
    const keys = Object.keys(pkgs), missing = [];
    for (const [path, entry] of Object.entries(pkgs))
      for (const dep of Object.keys(entry.optionalDependencies ?? {}))
        if (!keys.some((k) => k === `node_modules/${dep}` || k.endsWith(`/node_modules/${dep}`))) missing.push(`${path || "<root>"} -> ${dep}`);
    if (missing.length) { console.error(`package-lock.json is missing ${missing.length} optional platform entries:\n  ${missing.join("\n  ")}`); process.exit(1); }
    console.log("package-lock.json: all optional platform entries present");
    ```
- `tsconfig.base.json`; every package tsconfig sets `composite: true, declaration: true, emitDeclarationOnly: true, outDir: 'dist-types'`. Type-check with `tsc -b`, `-b` first.
  - Base options: `strict`, `target: es2023`, `module` and `moduleResolution` both `nodenext`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions` (legal with `emitDeclarationOnly`), `skipLibCheck`, `types: ["node"]`. TS 7 drops `node10` resolution and `baseUrl`, so do not use them.
  - Add a root solution `tsconfig.json` (`files: []`, with references to every package, to `tools/` and to `runtime`) and a `tools/tsconfig.json`. Both are WS0 rows in `ownership.json`.
- `biome.json`, in Biome 2.5 syntax:
  - `"vcs": {"enabled": true, "clientKind": "git", "useIgnoreFile": true}`;
  - `"formatter": {"indentStyle": "space", "indentWidth": 2, "lineEnding": "lf"}`;
  - `"json": {"formatter": {"enabled": false}}`, because every JSON file is written as `JSON.stringify(v, null, 2)` plus a final LF, and Biome's reflowing would break `project-format.save()` round-trips and the byte-identical checks;
  - `"files": {"includes": ["**", "!**/dist-types", "!**/out", "!runtime/gen", "!packages/*/src/gen", "!docs/reference", "!fixtures", "!vendor"]}` (Biome 2 replaced `files.ignore` with negated `includes`).
- `vitest.config.ts` with `test.projects: ['packages/*', 'apps/*', 'tools/gen-docs', 'runtime']`.
- Empty-but-green skeletons for `packages/project-format`, `dsdb`, `lang`, `compiler`, `asset-pipeline`, `toolchain`, `cli`, `ipc-contract`, `editor-core`, `language-service`, `monaco-dss`, plus `apps/ide`, `tools/gen-docs` and `runtime`. The package names `@dsdude/compiler` and `@dsdude/asset-pipeline` are fixed (C4), so use `@dsdude/<folder>` throughout.
  - Each skeleton gets a `src/index.ts` exporting interface types, one passing test, and a `CLAUDE.md` of at most 60 lines: owner, owned paths, contracts with paths and versions, test command, isolation strategy, and "read docs/kickoff/wsN.md first". Generate the briefs with `tools/phase0/gen-briefs.ts` from one table, so task 7 can regenerate them with the final versions.
  - For cloud-stream packages (`runtime/CLAUDE.md`, `packages/compiler`, `lang`, `dsdb`, `asset-pipeline`, `language-service`, `monaco-dss`, `editor-core`, `tools/gen-docs`), the test command is the Linux one from the PLAN.md section 7.5 cloud table, followed by "WS0 also runs it on Windows at integration" and "Cloud session: see the Cloud setup block in docs/kickoff/wsN.md". No Windows paths in those briefs.
  - `runtime`: `runtime/package.json` named `@dsdude/runtime`, with a `build:runtime` script that prints "not implemented until WS3" and exits 0, and a `test` script; `runtime/tsconfig.json`, `runtime/vitest.config.ts`, and `runtime/src/index.ts` with its one test under `runtime/src/` (all WS3's after the tag, section 3.4); `runtime/CLAUDE.md` (WS2's brief) and `runtime/platform/ds/CLAUDE.md` (WS3's brief).
- `LICENSE` (MIT, root), `runtime/LICENSE` (Zlib), and a root `README.md` of at most 20 lines pointing at `CLAUDE.md`, `PLAN.md` and `docs/kickoff/README.md` (section 2.11).
- Spike 13, your part: in a throwaway fresh worktree, `npm install` must leave `node_modules/electron/path.txt`, and an injected type error must make `tsc -b` fail. With `$env:DSDUDE_SKIP_ELECTRON = '1'`, the postinstall must skip `install-electron`. Record the result in `docs/status/ws0.md`.

**Task 3. Hooks and governance tools (spike 1).**
- `tools/ownership.json`: the section 3.4 table as path glob → owner, with `from`/`until` fields that name git tags (below). It encodes:
  - the pre-tag rule: WS0 anywhere except WS1's entries (beyond the `packages/toolchain` and `packages/cli` skeletons, `api.ts` + `MockBuildService` and the `cli.md` draft), and WS1 its own entries from hour zero;
  - the WS1 → WS8 transfer at the `start-ws8` tag (created at CP-C in hybrid mode, at WS8's launch in the standard-mode fallback);
  - WS6b's entries held by WS6 while WS6b does not run;
  - the generated-paths rule, including `fixtures/**/*.dsdb` (generator: `tools/gen-dsdb.ts`; inputs: the sibling `.dsda`, `contracts/builtins.json`, `contracts/opcodes.json`);
  - your section 5.1 holding rows for owners that have not started;
  - the four shared-file rules: `contracts/CHANGELOG.md` append-only for any contract owner's own contracts, and for WS7 under the C2 `builtins.json` section; new `docs/adr/NNNN-*.md` files only, for any stream; WS7 limited to the `doc`/`example` fields of existing `contracts/builtins.json` entries, checked by a field-level JSON diff; and WS0 appending to the `## Integration feedback` section of any `docs/status/wsN.md`, checked like the CHANGELOG rule.

  Event names are annotated git tags on `main`, and only WS0 creates them: `phase0`, `toolchain-ok`, `cp-a`, `cp-b`, `cp-c`, `m2` and `start-ws<n>` (`start-ws2` .. `start-ws8`, `start-ws6b`). Tag `start-ws<n>` just before telling the user to launch that stream. A row is active when its `from` tag exists (or it has no `from`) and its `until` tag does not; `check-ownership.ts` resolves tags with `git rev-parse -q --verify refs/tags/<name>`. The rows:
  - Stream rows are `from: phase0`; WS1's rows have no `from`.
  - WS0's holding rows for an owner that has not started end `until: start-ws<n>`.
  - WS1's rows end, and WS8's rows begin, at `start-ws8` in every mode (in hybrid mode you create that tag at CP-C).
  - Hybrid mode has no WS0 holding row for WS1's paths. Only a switch to the standard-mode fallback adds WS0 `from: cp-b, until: start-ws8` for them.
  - WS6 holds WS6b's rows `until: start-ws6b`.
  - `samples/minimal` and `samples/flappy` are WS4 `from: phase0, until: m2` and WS7 `from: m2`.
  - WS0 rows `from: phase0` for `fixtures/runtime-core/flappy-nitrofs/**` (you build it locally with grit/mmutil for the cloud stream WS2) and `fixtures/assets/golden/**` (you generate it locally with py-desmume for WS5's screenshot check). WS2's `fixtures/runtime-core/**` and WS5's `fixtures/assets/**` rows exclude them.

  Put this list in an `events` block at the top of `tools/ownership.json` and in `contracts/README.md`.
- `tools/check-ownership.ts`: one module used two ways, on staged files (pre-commit) and per commit (integration), against `ownership.json` at main's HEAD (`origin/main` when `CLAUDE_CODE_REMOTE=true` or when there is no local `main`, as in a cloud clone).
  - If `main` has no `tools/ownership.json` yet, allow everything and print a warning.
  - A path matched by no active row is a violation.
  - Add a unit test that walks every file in the Phase-0 tree and asserts each one has an owner after the tag: runtime's `tsconfig.json`, `vitest.config.ts` and `src/**` go to WS3; `fixtures/conformance/**` except `expected/` goes to WS4; `tools/tsconfig.json` and the root `tsconfig.json` go to WS0.
- `.githooks/pre-commit` (sh, LF): `node_modules/.bin/biome check --staged --no-errors-on-unmatched` (without `--write`; print "run npm install first" if the binary is missing), then `node tools/check-ownership.ts`. `.githooks/commit-msg`:
  - adds the `DSDude-WS: WSn` trailer from `git config --worktree dsdude.ws` with `git interpret-trailers --in-place --if-exists doNothing --trailer "DSDude-WS: WSn"` (a cloud clone has no `extensions.worktreeConfig`, so the same command reads its local value);
  - rejects a staged `package-lock.json` unless the stream is WS0 and the message is `chore(deps): regenerate lockfile`, and runs `node tools/check-lockfile.mjs` when the lockfile is staged.
- `.githooks/pre-push` (sh, LF) checks the whole pushed history, not just the tip tree: it refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`), or any `mwccarm/`, `license.dat` or `dsd-*.exe` path. A file committed and then untracked again is still caught. This version passes clean branches and annotated tags and refuses history leaks on existing and new branches (tested 2026-09-25 in a scratch repo):
  ```sh
  #!/bin/sh
  while read lref lsha rref rsha; do
    case "$lsha" in *[!0]*) ;; *) continue;; esac
    case "$rsha" in *[!0]*) range="$rsha..$lsha";; *) range="$lsha --not --remotes=$1";; esac
    bad=$(git log --format= --name-only $range -- vendor ':(glob)**/mwccarm/**' ':(glob)**/license.dat' ':(glob)**/dsd-*.exe' ':(exclude)vendor/README.md' | sort -u)
    if [ -n "$bad" ]; then echo "pre-push: proprietary files in pushed history:"; echo "$bad"; exit 1; fi
  done
  exit 0
  ```
- Merge commits are exempt. After commit-msg has added the trailer, both commit hooks exit 0 when `git rev-parse -q --verify MERGE_HEAD` succeeds. Merges carry main's regenerated lockfile and other streams' files, and the integration run checks every non-merge commit anyway.
- Commit the hooks with `git add --chmod=+x .githooks/pre-commit .githooks/commit-msg .githooks/pre-push`, so git on Linux (cloud clones) runs them.
- `tools/adr-pending.ts`: `git grep -n ADR-pending` across every local `ws*` branch and every cloud push target in `docs/status/cloud.md` (`origin/ws*`, `origin/claude/*`), grouped by branch and ADR number.
- `tools/memsampler.ps1`: `Get-Counter '\Memory\Available MBytes','\Memory\Committed Bytes'` once a minute. The script creates `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude` if needed and appends one CSV line per minute, `yyyy-MM-ddTHH:mm:ss,availableMB,committedBytes`, to `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\memsampler.log` with `Add-Content -Encoding ascii`. Start it detached and leave it running: `Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-File','C:\Users\zache\OneDrive\Desktop\Projects\DSDude\tools\memsampler.ps1'`. It is the one process without a timeout.
- `tools/checkpoint.ps1`, Day-1 part:
  - every run first warns when `OneDrive.exe` is running and the repo path is under `%OneDrive%` (risk 10: pause the instances and turn Desktop sync off);
  - `-MemoryOnly` prints the minimum Available MBytes and the peak commit charge since a given time, from `memsampler.log`, and restarts the sampler if the log is more than 5 minutes old;
  - `-AdrOnly` runs `tools/adr-pending.ts`;
  - the merge steps of task 8 follow by the end of D+1.

  Before the local launches at the tag, run `tools/checkpoint.ps1 -MemoryOnly` for the memory gate.
- `.claude/settings.json`: one permission allowlist shared by all instances, with rules for both the Bash and the PowerShell tools. Task 1 commits the allowlist and the `npm ci` deny rule; this task adds the cloud rules and the SessionStart hook.
  - Allow: npm, node, vitest, tsc and biome; `npx dsdude`, `npx dsdb-asm`, `npx dsdb-dis`, `npx electron-vite`, `npx playwright`, `npx install-electron`; read-only and branch-local git; `mingw32-make`/`make`; `C:\msys64\usr\bin\bash.exe -lc` with `make`; `taskkill`, `where.exe`, `Get-Process`; `python tools/screenshot.py`; `runtime\build-host\dsdude-host.exe`.
  - For cloud sessions, also allow `bash tools/cloud/*`, `make -f runtime/Makefile.host *`, `runtime/build-host/dsdude-host *`, `./runtime/build-host/dsdude-host *`, `timeout *`, `node tools/*`, `npx playwright install chromium`, `git fetch *`, `git merge origin/*`, `git restore package-lock.json`, `git config core.hooksPath .githooks`, `git config core.autocrlf false` and `git config dsdude.ws *` (the Bash-tool forms), and add a SessionStart hook (matcher `startup|resume`) that runs `node tools/cloud/session-start.mjs`. Without them a session in Accept edits mode stops for a prompt on each.
  - Deny: `npm ci` from Day 1. Add the `pacman` and `wf-pacman` deny rules in the tag commit, after WS1's install and spike 4 are done (WS1's hour-zero exception), including a wildcard rule for the `bash.exe -lc '... wf-pacman ...'` form.
  - Spike 1 checks one allowed and one denied command and records whether the embedded `bash.exe -lc` form is caught. If it is not, say so in the commit message: the real guard is the user never approving such a prompt after the tag (`CLAUDE.md`, `docs/kickoff/README.md` section 5).
- Spike 1, scripted as `tools/phase0/spike1-hooks.ps1`. Wrap the whole spike in `try { ... } finally { ... }`, with the cleanup below in `finally`, so an aborted run leaves no worktree or branch behind. Setup: `git worktree add ..\DSDude-spike1 -b spike1-tmp` (not a `ws*` name, so the ADR and checkpoint listings ignore it), then `git config --worktree dsdude.ws WS1` (WS1's rows are the only stream rows active before the tag).
  1. Commit `packages/toolchain/src/spike.ts`: it passes, and the message ends with `DSDude-WS: WS1`.
  2. Commit `runtime/core/spike.c`: pre-commit rejects it.
  3. Commit `samples/hello/Makefile` with CRLF bytes: it passes.
  4. Switch to `dsdude.ws WS0` and stage a changed `package-lock.json`. With message `wip`, commit-msg rejects it; with `chore(deps): regenerate lockfile`, it passes.
  5. Merge a branch that changed `package-lock.json` and a foreign path: it passes, with and without a conflict.
  6. Force-add `vendor/probe.txt` (`git add -f`), commit it with `--no-verify` (the spike's one bypass), and push to a scratch bare repo (`git init --bare ..\DSDude-spike1.git`): pre-push refuses it. Then `git rm --cached vendor/probe.txt`, commit, and push again: pre-push still refuses it, because the file is in the pushed history.

  Then add a second, detached worktree, `git worktree add --detach ..\DSDude-spike1b spike1-tmp` (git refuses to check out a branch another worktree already uses), and check with `git ls-files --eol samples/hello/Makefile .githooks/*`, plus a byte check, that both check out LF. The `finally` block removes both worktrees with `git worktree remove --force`, deletes `..\DSDude-spike1.git`, and runs `git branch -D spike1-tmp`.
- **Cloud pieces** (canonical design and the reference `lib.sh`/`start.sh`/`push.sh`: `docs/kickoff/README.md` section 8). Commit them on Day 1 and push `main` before the probe:
  - `tools/cloud/session-start.mjs`, plain JS so Node 22 runs it, and it never fails. It exits at once unless `CLAUDE_CODE_REMOTE=true` (silent on Windows), appends `export PATH=/opt/node24/bin:$PATH` and `export DSDUDE_HOME=$HOME/.dsdude` to `$CLAUDE_ENV_FILE`, and, if `DSDUDE_WS` is set, runs `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws $DSDUDE_WS`.
  - `tools/cloud/lib.sh`, `start.sh` and `push.sh`, committed LF with `git add --chmod=+x`. Copy them from the reference versions in README sections 8.4 and 8.5; `lib.sh` also adds `main` to a single-branch clone's fetch refspec.
  - `docs/status/cloud.md`, the registry, one line per cloud stream: ``- WS4: environment `dsdude-ws4`; session <url>; push target `<ref>`; started <date>; last merged <sha>``.
  - `docs/status/wsN.md` stubs for WS2-WS8 and WS6b (a title plus the closing `## Integration feedback` heading). For `docs/status/ws1.md`, which WS1 creates at hour zero, append the heading on `main` right after your first merge of `ws1-toolchain`; before the tag you may not write WS1's entries.
- **Cloud probe** (Phase 0, Day 1, before the tag). It confirms the open unknowns that README section 8 marks (Pn): tool versions, clone depth and refs, whether the Windows lockfile installs on Linux, the hooks in a clone, which push targets work, the Playwright hosts, and the permission modes. The user opens one session (environment `dsdude-ws4`, branch `main`, mode Auto) and pastes:

  ```text
  DSDude cloud probe, requested by the user. Change no tracked file on main; report one line per item.
  1. `check-tools`; `node -v` in a fresh Bash call; `npm -v`, `gcc --version`, `make --version`; `echo $CLAUDE_CODE_REMOTE $DSDUDE_WS`.
  2. `git rev-parse --is-shallow-repository`, `git branch -a`, `git tag`, `git config --get-all remote.origin.fetch`.
  3. `git config dsdude.ws` (did the SessionStart hook set it?); then `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS4`; then `bash tools/cloud/start.sh`, then `npm run check && npm test`.
  4. Make an empty commit. Did it get a `DSDude-WS:` trailer?
  5. Push it to `HEAD:refs/heads/probe-plain`, then `HEAD:refs/heads/claude/probe-named`, then your own branch; give each exit code and error.
  6. `curl -sI https://cdn.playwright.dev`, `curl -sI https://playwright.download.prss.microsoft.com`, `curl -sI https://api.github.com` and `curl -sI https://raw.githubusercontent.com` (status and `x-deny-reason`); then `npx playwright install chromium`.
  7. Which permission modes are offered?
  ```

  Then you:
  - record the results in `docs/status/ws0.md` ("Cloud probe") and the working push order in the CLAUDE.md Status block, and ask the user whether the branch selector offered branches other than `main` (P8);
  - delete the probe branches with `git push origin --delete ...`;
  - fix `push.sh`, or tell the user what to change in the environments, if anything failed.

  If step 3 fails, the cloud streams due at the tag wait under the fallback rule.

**Task 4. Small contracts, C4 types, project format, samples.**
- **Version headers.** Every Phase-0 contract starts at 0.1.0. T1 bumps the minor and T2 bumps the major, so the first breaking change goes to 1.0.0.
  - Markdown contracts: line 3 is `Version: 0.1.0 · Owner: WSn · Changes: see the tiers in contracts/README.md`, and the last section is `## How to change me`.
  - JSON contracts are objects `{"contract": "C13", "version": "0.1.0", "howToChange": "...", <payload>}`. The payload key is `limits` for `runtime-limits.json` (exactly the section 5 C13 keys and values), `opcodes` for `opcodes.json` and `entries` for `builtins.json`.
  - TypeScript contracts open with `/** Contract C4 v0.1.0. How to change me: ... */` and export `CONTRACT_VERSION`.
- Write in this order: C9's `Diagnostic` type, a minimal C1 `Project` type, `api.ts`, then `cli.md`.
- `contracts/diagnostics.md` (C9): the shape `{severity, code, message, hint, file, line, col, endLine, endCol, source}`; the ranges E1xx/E2xx/E3xx/E4xx/E6xx/W0xx/R5xx, with E290-E299 (project-format) and E49x (compiler-detected hardware limits) as sub-ranges, and the five catalog paths (section 5 C9); "one mistake yields one diagnostic"; the message template (what happened / what to do / where); the banned-word list; codes shown after the message as a link; the new W lints (Visible-off objects exempt from the no-sprite lint).
  - The TypeScript form (`Diagnostic`, `Severity` and a zod schema) lives in `packages/project-format/src/diagnostics.ts` and is re-exported from `@dsdude/project-format`; every producer imports it from there.
  - E290-E299 cover project-file problems found by `project-format` and are catalogued in `packages/project-format/src/diagnostics/catalog.ts` (yours). `diagnostics.md` lists five catalogs, and gen-docs renders all five.
- `contracts/runtime-limits.json` (C13): copy every key and value from section 5 C13 exactly.
- `contracts/log-protocol.md` (C8): the READY/LOG/ERR/MEM/STAT/PAD/EXIT lines; one protocol chosen from `0x04FFFA00`; never `nocashMessage()`; a >= 5 KB flush pad of at least five `DSD|PAD|` lines of <= 1023 chars after READY/ERR/STAT; lines <= 1023 chars from a static main-RAM buffer. An embedded newline in LOG or ERR text starts a new `DSD|LOG|` line, `\r` is dropped, and text longer than one line allows continues on further `DSD|LOG|` lines.
- `contracts/cli.md` draft (C10): the subcommands, flags, exit codes 0/1/2, `dsdude screenshot <rom> --frames N [--keys file] --out dir`, and `cliCommands: CliCommand[]` registration (the type is in `api.ts`).
- `contracts/ipc.md` + `packages/ipc-contract` (C5): the invoke and event channels of section 5 C5, as zod stubs.
- `packages/toolchain/src/api.ts` (C4): types only, and a ~30-line `MockBuildService` (fake log, fake diagnostics, a fake emulator that waits). Besides `BuildService`, `BuildEvent`, `ToolPaths` and `EmulatorHandle` it declares:
  - `AssetManifest` (names → ids, dimensions, frames) and `RoomAssetSet`, marked provisional until WS5's C3;
  - `CompileFn = (project: Project, manifest: AssetManifest) => {dsdb: Uint8Array; roomSets: RoomAssetSet[]; diagnostics: Diagnostic[]}`, synchronous and Worker-safe;
  - `PackAssetsFn = (project: Project, toolPaths: ToolPaths) => Promise<{manifest: AssetManifest; diagnostics: Diagnostic[]}>`;
  - `CheckRoomBudgetsFn = (manifest: AssetManifest, roomSets: RoomAssetSet[]) => {manifest: AssetManifest; diagnostics: Diagnostic[]}`, exported by WS5 as `checkRoomBudgets` and called by `BuildService` after `compileProject`;
  - `CliCommand {name; summary; run(argv: string[]): Promise<0|1|2>}`, so packages export `cliCommands: CliCommand[]` without importing `packages/cli`.

  `@dsdude/toolchain` never imports `@dsdude/compiler` or `@dsdude/asset-pipeline` (they import its types, and project references must stay acyclic): `BuildService` receives the three functions injected by the composition roots, `packages/cli` and the IDE build worker.
- `packages/asset-pipeline/src/preview.ts` (C12): `previewSprite(png, opts) → {palette, indices, colorCount, frames}` types.
- C1: `contracts/project-format.md` + zod schemas + load/save in `packages/project-format` (section 5 C1, including the defaults; no migrations until a v0 project exists). `src/index.ts` stays browser-safe: `load(fs, dir)` and `save(fs, dir, project)` take an injected `ProjectFs {readFile, writeFile, readDir, exists}`, and the Node adapter is the `@dsdude/project-format/node` subpath (`src/node.ts`).
- `samples/minimal` (one sprite moved with the D-pad, for M2) and `samples/flappy` v0, per the section 4 listing: `obj_bird`, `obj_pipe`, `obj_gap`, `obj_ctrl`, `obj_hud`, `rm_game`, and the sprites and three sounds the code names. PNGs and WAVs come from scripts under `tools/phase0/`.
  - Add `objects/obj_ctrl/create.dss` with `alarm[0] = 60;`, or no pipe ever spawns.
  - Sprites: `spr_bird` 16x16 with 3 frames, origin (8,8); `spr_pipe` 32x64, origin (16,0); `spr_gap` 8x48, origin (4,24); plus `icon.png` at 32x32 with at most 15 colours.
  - `rm_game` places `obj_bird` at (64, 96), and `obj_ctrl` and `obj_hud` at (0, 0), all on the top screen, with no backgrounds.
  - Otherwise copy the listing as written. One 64-px pipe at the gap's height is not yet an upper and a lower pipe, so file `docs/adr/0001-flappy-pipe-geometry.md` with a recommended fix for the user: `obj_ctrl` spawns two pipes, `instance_create(272, gy - 152, obj_pipe); instance_create(272, gy + 24, obj_pipe);`, and `obj_pipe`'s `create.dss` adds `image_yscale = 2;` (128 px, within the 2x scale limit). The 48-px gap is then the only way through for every `gy` in 48..144.

### Phase 0, Day 2

Order: task 6's `dsdb.md` and `opcodes.json` first (they freeze at the tag), then the `builtins.json` signatures, the generators and `packages/dsdb`, then task 5, then task 7. If the day runs late, cut in this order: docs and examples beyond Flappy's builtins, conformance programs 4-5 (WS4 adds them), then `events.md` prose beyond the section 4 lists. Never cut `dsdb.md`, `opcodes.json`, the `builtins.json` signatures, the generators, the hooks or the definition-of-done run.

**Task 5. `contracts/language.md` v0.1 and `contracts/events.md` (C6; sections 4, 2.8, 3.3).**
- `language.md`: EBNF, precedence, optional semicolons (W032), number rules (section 2.8), truthiness, `with`/`other`, arrays, scopes, the eight pinned semantics rules and the three small rules, and the omission list (section 1).
  - The program form: a tier v0-v1 conformance program is one `.dss` file whose top-level statements run once and whose functions are global. Top-level statements are legal only in program form. Tier v2+ programs are small projects in folders.
  - Pin the printing rules before writing any expected output: `string(n)` rounds the exact Q20.12 value half away from zero to 2 decimals, then drops trailing zeros and a trailing point, and never prints `-0`; booleans print as `true`/`false` and undefined as `undefined`; arrays print as `[1, 2, 3]`; instance ids and asset ids print as numbers (section 2.8). `point_direction` returns degrees as Q20.12 in [0, 360), counter-clockwise with y pointing down, exact at multiples of 45.
- `events.md`: event file names, frame order, room load order, inheritance, room changes, Outside Room, and same-screen collisions.

**Task 6. Minimal C2 (section 5 C2).**
- `contracts/dsdb.md`: the header (the ABI hash, defined byte-exactly below; the RNG seed), the section table, 8-byte cells holding 32-bit handles, the calling convention, event ids, OBJS and ROOMS, and the `.dsda` grammar.
  - The program-form DSDB has no OBJS or ROOMS entries, and FUNC 0 is named `__main`. After `DSD|READY` the runtime calls `__main` once and prints `DSD|EXIT|0`, and the host runner exits (`--frames` is ignored).
  - Decide and write down each of the following, with one sentence of rationale:
    - CALL calls a DSS function by FUNC index.
    - CALLN calls a builtin with an explicit argument count. For example, in `CALLN A B C` the arguments start at rA, B = argc, the result goes to rA, and C is a dense runtime function index that gen-builtins assigns and emits, so `builtins.json` ordinals may exceed 255.
    - Jumps use a signed 16-bit instruction offset (`AsBx`).
    - Event ids are `kind:8 | arg:16`, with kinds numbered in `events.md` order and arg = the alarm, user or button index, or the target object id for collision events.
  - The assembler test must assemble `hello.dsda` and conformance v0 program 01 using only stable opcodes.
- `contracts/opcodes.json`: the 29 stable opcodes, the provisional names with reserved numbers, and reserved numbers for the int-specialised ADD/SUB/MUL/CMPJ variants.
- `contracts/builtins.json` lists, in this ordinal order: the 85 section-4 functions by category; then the built-in instance variables, the globals and the constants of section 4 (`self`/`other`/`all`/`noone` = -1/-2/-3/-4). Ordinals are append-only forever, so this order is permanent.
  - Variable entries add `scope` (instance|global), `type`, `readonly` and `arrayLength` (alarm 8; `view_x` and `view_y` 2). Constant entries add `value`.
  - Types come from one closed list written in `dsdb.md`: number, int, string, bool, any, array, instance, object, sprite, sound, room, background, button, screen, color, void.
  - `allowedEvents` is `*` or a list of event file stems from `events.md` (drawing functions: `draw`).
  - Docs and examples are written only for the ~30 builtins Flappy uses; the rest are `TODO(WS7)`. Alias and unsupported entries follow later as T1 appends.
  - `dsdb.md` defines the ABI hash byte-exactly: FNV-1a 32 (offset basis 0x811C9DC5, prime 0x01000193) over the UTF-8 lines `id|name|kind|paramTypes|minArgs|maxArgs|returns|scope|value`, joined with LF, for entries of kind function, variable or constant, in id order. Param names, doc, example, category, allowedEvents, pure and since are excluded, and so are alias and unsupported entries, which never reach the runtime; compiler-only appends therefore never invalidate bytecode.
- `tools/gen-builtins.ts` → `runtime/gen/builtins_table.h`, `packages/compiler/src/gen/builtins.ts`, `packages/language-service/src/gen/builtins.ts`. `tools/gen-opcodes.ts` → `runtime/gen/opcodes.h`, `packages/dsdb/src/gen/opcodes.ts`. The CI check regenerates and fails on any byte difference.
- Table-driven `packages/dsdb` (encode/decode/assemble/disassemble) and `fixtures/bytecode/hello.dsda` → `hello.dsdb`, round-tripping in a test.
  - `.dsda` never contains the ABI hash or numeric builtin ids. It names builtins, and the assembler stamps ids and the hash from `contracts/builtins.json` and `contracts/opcodes.json`.
  - Every committed `fixtures/**/*.dsdb` is generated from its sibling `.dsda` by `tools/gen-dsdb.ts` (yours), and `npm run check` reruns it and requires byte-identical output. A builtin append then regenerates the fixtures in the same commit instead of breaking WS2's tests.
  - `hello.dsda` is a program-form DSDB whose `__main` is `show_debug_message("hello")`; the expected log is `DSD|LOG|hello` followed by `DSD|EXIT|0`. Write it in canonical disassembler form, with no comments (explanations go in `fixtures/bytecode/README.md`), so that dis(asm(hello.dsda)) equals the file byte for byte.
  - `packages/dsdb/package.json` gets `"bin": {"dsdb-asm": "src/cli-asm.ts", "dsdb-dis": "src/cli-dis.ts"}` (usage: `dsdb-asm in.dsda -o out.dsdb` and `dsdb-dis in.dsdb [-o out.dsda]`), because WS2 hand-assembles fixtures from D+1 and M1 names `dsdb-dis`.

**Task 7. Fixtures, kickoff files, tag.**
- `tools/phase0/make-fixtures.ts` writes `fixtures/assets/`: a 16x16 3-frame sprite PNG, a 256x192 background PNG and one WAV.
- Conformance v0 in `fixtures/conformance/`: 5 pure-computation programs with expected `DSD|LOG` output.
  - Name programs `fixtures/conformance/v0/NN-<name>.dss`. Expected output goes in `fixtures/conformance/expected/v0/NN-<name>.log`: only the `DSD|LOG|` lines, LF endings, with a final newline.
  - Keep v0 fractions to values whose two-decimal form is unambiguous, plus one case that exercises the rounding rule.
  - Hand-assemble v0 program 01 into `fixtures/bytecode/conformance/v0-01.dsda` to prove the stable set; WS2 hand-assembles the rest.
- `contracts/README.md`: the C1-C14 index with owners, versions and freeze points, and the tiers of section 7.4. `contracts/CHANGELOG.md`: one section per contract.
- Finalise every `docs/kickoff/wsN.md` with the contract versions, owned paths, the env block (local streams) or the "Cloud setup" block (cloud streams), and the hybrid operating mode (one "Operating mode:" line in each paste block, naming the local slot or the cloud session). Check that every checkpoint-ritual line says to run `git restore package-lock.json` before `git merge main` (cloud streams: before `git merge origin/main`), and that every status-file template ends with `## Integration feedback`. Regenerate the package briefs with `tools/phase0/gen-briefs.ts`.
- Rewrite the Status block of `CLAUDE.md`: Phase 0 done (tag `phase0`, <date>; see `docs/status/checkpoint-N.md`); BlocksDS 1.24.0 installed per `docs/status/ws1.md`, and the `toolchain-ok` state; operating mode hybrid (or the recorded fallback), the usage-limit answer and the working cloud push order from the probe; which stream holds each local slot and which cloud streams run. Update the block at every checkpoint and launch.
- Add the `pacman`/`wf-pacman` deny rules to `.claude/settings.json` in the tag commit (task 3).
- Run the definition of done below on a clean clone, then `git tag -a phase0 -m 'phase0'`, `git push origin main --follow-tags`, and tell the user which streams to launch.

### After the tag

**Task 8. Daily integration: `tools/checkpoint.ps1`.** Put a timeout on every step. If `origin` is unreachable, integrate the local branches, report the cloud streams as not fetched, and push later: integration never needs GitHub (risk 27). It does the following:
1. Warns if `OneDrive.exe` runs and the repo is under `%OneDrive%` (task 3). Fetches: `git fetch --prune --tags origin '+refs/heads/ws*:refs/remotes/origin/ws*' '+refs/heads/claude/*:refs/remotes/origin/claude/*'`.
2. The refs are `wsN-<name>` for local streams and `origin/<push target>` from `docs/status/cloud.md` for cloud streams. The list of local streams comes from the `CLAUDE.md` stream table (WS1, WS3, WS6, WS8, plus any stream the Status block records as moved home), not from `git branch --list 'ws*'`. A new push target is the fetched ref whose `docs/status/wsN.md` names it in a `Cloud push target:` line (accept it with or without a `- ` list-item prefix, as `lib.sh` does); cross-check it with the branch the user passed on, then update the registry.
3. For each ref in dependency order, whatever its location (contract producers first: WS1/WS8, WS4, WS2, WS3, WS5, WS6, WS6b, WS7), lists `git rev-list --no-merges main..<ref>`. It checks each commit's files against `ownership.json` at main's HEAD for the stream in its `DSDude-WS:` trailer (if missing, the branch's stream, or the registry's for a cloud ref), applying the shared-file and generated-path rules. Any violation refuses that ref.
4. Merges on a throwaway branch, so `main` moves only when green and is never force-moved (local streams read the same `main` ref and must never see a refused merge). Start with `git switch -C integrate main`. For each ref, `git merge --no-ff <ref> -m "Merge wsN-<name>"` (cloud: `-m "Merge wsN-<name> (cloud <target>@<sha>)"`).
   - On a conflict (likely in appended files such as `contracts/CHANGELOG.md` or a status file), `git merge --abort`, refuse the ref, and record an `IF-` entry (appended in step 11) asking the stream to merge `main` (cloud: `origin/main`) and resolve it.
   - After each merge, run `npm run check && npm test` (after `npm install` if a `package.json` changed). On red, `git reset --hard HEAD~1` (on `integrate` only) and refuse that ref.
   - Steps 5-8 also run on `integrate`. Then `git switch main; git merge --ff-only integrate; git branch -D integrate`, before steps 9-12.

   If a merged cloud target is not `wsN-<name>`, it fast-forwards the stream line with `git push origin <merged tip>:refs/heads/wsN-<name>` (never `--force`), so replacement sessions start there.
5. If any `package.json` changed, runs `npm install`, then `node tools/check-lockfile.mjs`, and commits `chore(deps): regenerate lockfile`.
6. Runs `npm run check && npm test` on Windows (separators, CRLF, case and spawning, which Linux-only passes hide).
7. Runs the host goldens once WS2's `runtime/Makefile.host` exists: `mingw32-make -f runtime/Makefile.host test`, with `C:\msys64\ucrt64\bin` on PATH. On the goldens WS2 makes with Linux gcc, this is the DoD's cross-compiler identity check.
8. Runs `dsdude screenshot` of `samples/hello` once WS1 has delivered it, and compares the PNG with its golden. Then the local-only checks per merged cloud stream: WS2, `fixtures/runtime-core/flappy-nitrofs/` rebuilt with local grit/mmutil when WS2 asks (your row); WS4, `hello.dsdb` on both emulators and the M1 gate with WS3; WS5, its tests with real grit/mmutil (`ToolPaths` set), `npx dsdude assets samples/flappy`, GRF/soundbank identity, the XM fixture, and (after M2) the `dsdude screenshot` against the py-desmume golden in `fixtures/assets/golden/`, which you generate and own. WS6 checks WS7's and WS6b's UI in the Electron IDE at checkpoints. Skip steps 7 and 8 until their inputs exist.
9. Summarises the minimum available memory and peak commit charge since the last checkpoint from `memsampler.log`, restarting the sampler if the log is more than 5 minutes stale.
10. Lists the `ADR-pending` inventory (`tools/adr-pending.ts`, local and cloud refs).
11. Writes `docs/status/checkpoint-N.md` with a "Cloud streams" table (target@sha, commits behind main, merged or refused, local-only results, the versions start.sh recorded), appends the integration-feedback entries, and commits.
12. Runs `node tools/check-lockfile.mjs`, then `git push origin main --follow-tags` (pre-push guards `vendor/`). Cloud streams read `main`, the tags and the checkpoint report only there.

**Integration feedback.** Every failure that only a local run finds (real grit/mmutil, MSYS2 gcc, the DS build of the core, emulators, Electron) goes into the checkpoint report and is appended to the end of the owning stream's `docs/status/wsN.md` on `main`, under `## Integration feedback` (add the heading if missing): ``- IF-<k> <date> checkpoint-<N> @<sha>: <check> failed: `<command>` -> <first error lines or file:line>. Action: <what to do>.`` Close an entry by appending `- IF-<k> resolved by <sha>`. Append only.

**Task 9. Checkpoints and launches.** CP-A D+3. CP-B at M0 (D+7; ~D+7-10 in the standard-mode fallback). CP-C at M1 (D+14; ~week 4-5 in the fallback). Then weekly (standard fallback: plus one at every slot hand-off). Each is a two-hour review on top of task 8, with the section 7.3 list: freezes, milestone criteria, and the contract changes and ABI hash since the last checkpoint.
- Apply the late-start freeze rule: a stream's interface freezes at the first checkpoint at least three working days after the stream starts.
- Recommend a local launch only if minimum available memory stayed above 1.5 GB. At each checkpoint, ask the user whether the usage limits still hold; if not, shed WS6b first, then let WS7 and WS5 wait for a free cloud slot, then switch to the fallback.
- **Local launch:** `git tag -a start-wsN -m 'launch WSn'`, push, and tell the user; the user creates the worktree (Setup).
- **Cloud launch:** run `git tag -a start-wsN -m 'launch WSn'; git push origin main 'start-wsN^{commit}:refs/heads/wsN-<name>' --follow-tags` (this creates the stream line on `origin` without a local `wsN-<name>` branch, which listings of local `ws*` branches would mistake for a local stream), add the stream's line to `docs/status/cloud.md` (commit, push), then tell the user "launch WSn (cloud)". The user opens the session (README section 8) and gives you its URL and the branch it reports; record both in the registry.
- **Checkpoint relay:** a cloud stream waits at a checkpoint until the user relays "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..." (the full text is in README section 5); tell the user when to send it.
- At WS1's hand-off (CP-C; M0 in the standard-mode fallback), copy its leftovers from `docs/status/ws1.md` into `docs/kickoff/ws8.md`, including wiring `compileProject`/`packAssets` into `BuildService` for whichever has not landed. In the standard-mode fallback, also add WS3's M4 stress check and hardware notes at WS3's hand-off (in hybrid, WS3 keeps them), and do that wiring yourself between WS1's hand-off and WS8's start when WS4's or WS5's function lands.
- After merging WS1's `toolchain-ok` commit, run `git tag -a toolchain-ok -m 'toolchain-ok' <merge commit>` on main, push, update the `CLAUDE.md` Status block, and tell the user to launch WS3 in slot 2 (memory gate permitting).
- Create the event tags of task 3 as they happen: `cp-a`, `cp-b`, `cp-c` at those checkpoints, `m2` when M2 is accepted, and `start-ws<n>` just before each launch. Push each with `git push origin main --follow-tags`.

**Task 10. Standing duties.**
- T1 reviews within 24 h, and C2/C6/C11 merges within 24 h in weeks 1-4 (`ws2-*`/`ws4-*` cross-merges are allowed; both are cloud streams and merge each other's push target from `docs/status/cloud.md`).
- An ADR draft with a recommended answer for every T2 change and toolchain question, and for every change to a cloud environment's setup script or system packages.
- `project-format` migrations when first needed.
- New `tools/*` workspace packages added to `test.projects` by name.
- CODEOWNERS generated from `ownership.json` for the GitHub remote.
- Keep `docs/status/cloud.md` current (session URL, push target, last merged SHA), and list each cloud stream's recorded Node/npm/gcc versions in every checkpoint report (risk 22).
- In the standard-mode fallback only, the rest of spike 13 in week 1: Monaco 0.57 entry points in a `sandbox: true` window with the CSP, dockview-react, and Playwright `_electron.launch` after `electron-vite build` (in hybrid, WS6 runs it on its first day). Respect the one-dev-IDE limit.

## Definition of done (section 6 WS0)

- `npm install && npm run check && npm test` is green in `git clone C:\Users\zache\OneDrive\Desktop\Projects\DSDude C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean` (a clean clone, which also proves that `.gitattributes` wins over the system `core.autocrlf=true`), and `node_modules/electron/path.txt` exists afterwards. Then `Remove-Item -Recurse -Force C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean`.
- Both commit hooks are proven to run: a legitimate commit passes, while a foreign-path commit and a stray `package-lock.json` are rejected, and a merge bringing a regenerated lockfile and another stream's files passes. The pre-push hook refuses a `vendor/` file anywhere in the pushed history, including one committed and then untracked again. Makefiles and hooks check out with LF.
- Every contract written in Phase 0 has a version header and a CHANGELOG section. `contracts/README.md` lists C3, C7, C11 and `runtime-artifact.md` as owed, with owner and deadline.
- `hello.dsdb` disassembles to `hello.dsda`.
- `docs/kickoff/wsN.md` exists for every stream.
- The cloud pieces of task 3 are on `origin/main`; `if (git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md') { throw 'vendor/ is in GitHub history' }` passes, so `vendor/README.md` is the only vendor file GitHub has ever seen; and cloud-probe step 3 is green or the fallback is recorded.
- Tag `phase0` exists and is pushed to `origin`.

**Hand-off.** Never hands off: persistent integrator on main until release. In the standard-mode fallback it also handles fixes to WS1's paths and toolchain ADRs between WS1's hand-off to WS3 (M0) and WS8's start. If day 3 ends without the tag, WS0 tags `phase0` on main's last green commit anyway, so the ownership rows activate. It lists the missing items in `docs/status/ws0.md` and `contracts/README.md` and delivers each as an ADR (ADR-0002 onward) within 48 hours. The user then launches the streams due at the tag.

## Testing in isolation and verifying without eyes

**Isolation:** none needed; WS0 is the source of fixtures. Your fixtures are your tests:
- `hello.dsda` ↔ `hello.dsdb` round-trips;
- the generators are byte-identical on a rerun;
- the zod schemas load `samples/minimal` and `samples/flappy`;
- the hook script from spike 1 passes;
- `node tools/check-lockfile.mjs` passes on every regenerated lockfile;
- the clean-clone run is green: `git clone C:\Users\zache\OneDrive\Desktop\Projects\DSDude C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean` (not under `%TEMP%`, which lengthens every `node_modules` path past the 250-character rule), then `npm install && npm run check && npm test`, then `Remove-Item -Recurse -Force C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean`.

Conformance v0's expected output is hand-written, because no runtime exists yet. WS2 takes over `fixtures/conformance/expected/**` at the tag.

**Verifying without eyes.** You cannot see emulator or IDE windows. Verify with (1) `DSD|` log lines (READY/LOG/ERR/MEM/STAT/EXIT per contract C8) captured by `dsdude play` / EmulatorManager, which drops the `DSD|PAD|` flush-pad lines; lines arrive live because of the flush pad, or at graceful Stop (`taskkill /PID`, `/F` after 2 s); and (2) `dsdude screenshot <rom> --frames N [--keys file] --out dir`, which writes top and bottom PNGs via py-desmume 0.0.9 with SDL_VIDEODRIVER=dummy and SDL_AUDIODRIVER=dummy. Read the PNGs with the image-capable Read tool. A definition of done about what a screen shows means the `dsdude screenshot` PNG at frame N matches a golden PNG or passes a stated check. For runtime-core behaviour use `dsdude-host` JSONL traces and PNG frames (always with `--seed N`). Ask the user only when a screenshot is ambiguous. Put a timeout on every spawned process, and close the dev IDE and emulator after each test.

For WS0 this means reading the checkpoint's `samples/hello` screenshot PNGs back yourself, and checking the WS2 and WS4 trace and golden diffs in each report. A cloud stream's Linux-green result is never done on its own: it counts only after your Windows `npm test` and its local-only checks (risks 25 and 28).

## Coordination

- **`docs/status/ws0.md`:** the Day-0 answers, Phase-0 progress, spike 1 and 13 results, the cloud-probe results, open ADRs, and the current mode (hybrid or the recorded fallback) and schedule position.
- **`docs/status/cloud.md`:** the cloud-stream registry (task 3); you keep it current.
- **Tiers (section 7.4):**
  - T0: the owner commits with a CHANGELOG line.
  - T1: additive; minor version bump, regenerated outputs, fixtures and a CHANGELOG entry, all in the same commit; you review within 24 h.
  - T2: breaking; an ADR (context, decision, alternatives, affected streams, migration), co-signed by every affected owner. You draft the recommended answer, the user decides, you merge.

  Any stream may create `docs/adr/NNNN-*.md`. You number, edit and close ADRs; on a number collision, give the final number in the checkpoint report. Streams mark workarounds `// ADR-pending ADR-NNNN`, and `tools/adr-pending.ts` inventories them.
- **Checkpoint ritual:** Daily: run `git restore package-lock.json`, then merge `main` into your branch (cloud streams: `git fetch origin && git merge origin/main`; never rebase once WS0 has merged any of your commits), and keep `docs/status/wsN.md` current. WS0 integrates local and cloud branches daily with tools/checkpoint.ps1 (per-commit ownership check using the `DSDude-WS:` trailer, lockfile regeneration, `npm run check && npm test`, host goldens, `dsdude screenshot` of samples/hello, the local-only checks for cloud streams, memory-gate summary, ADR-pending inventory), writes docs/status/checkpoint-N.md and pushes `main` and the tags. At a checkpoint (CP-A/CP-B/CP-C, then weekly; standard fallback: also every slot hand-off): commit, update `docs/status/wsN.md` (progress, leftovers, open `ADR-pending` markers), then stop touching the branch until WS0 reports the merge (cloud streams: until the user relays "WS0 merged checkpoint-N"). At a slot hand-off the stream commits and records its leftovers in `docs/status/wsN.md`; WS0 merges; then a fresh instance starts the next stream in that slot from its kickoff file. Checkpoints are two-hour reviews run by WS0 and approved by the user. A stream that starts after the checkpoint at which one of its interfaces would freeze follows the late-start freeze rule (section 7.3): it freezes at the first checkpoint at least three working days after its start.
- **Your side of merge-main-daily:** `main` is never rebased or force-moved once a stream has merged it, and you never force-push it to `origin`. Push `main` and every tag after each run, because cloud streams see only `origin`. Report every merge in the checkpoint file so streams know when they may touch their branch again. The local repo stays the source of truth.

## Machine limits and gotchas

**Machine facts:**
- Windows 11 Home laptop, Ryzen 7 5825U, 16 threads.
- 11.3 GB usable RAM (8 GB + 4 GB DDR4-3200 SO-DIMMs, both slots full, board maximum 64 GB). Upgrade path: 2 x 16 GB DDR4-3200 SO-DIMM (32 GB) = upgraded mode.
- One Claude Code instance uses ~350 MB working set and ~600 MB private memory, growing with context.
- Background apps use ~3 GB (browser ~1.5 GB, Discord, Dropbox, Creative Cloud, Defender). With one Claude session and those apps: 3.2 GB free, commit charge 14.6 of 24.8 GB (page file already in use). Claude Code killed one background command for low memory during planning.
- The repo root `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` is 47 characters. Desktop is OneDrive-redirected, but the OneDrive client is not running and nothing syncs; if sync is ever re-enabled, `node_modules`, `.git` and `.dsdude` lock (risk 10; `checkpoint.ps1` warns).
- Git identity is set; `gh` is not installed.
- MSYS2 is at `C:\msys64`; bash is `C:\msys64\usr\bin\bash.exe`; always spawn it as `bash.exe -lc` with `CHERE_INVOKING=1`.
- Host C build: `C:\msys64\ucrt64\bin\gcc.exe` 15.2 and `mingw32-make.exe`; `C:\msys64\ucrt64\bin` must be on PATH for every host gcc spawn.
- Node 24 runs .ts natively; npm 11.13 workspaces (apps/* packages/* tools/* runtime). No VS C++ toolchain: no node-gyp compilation in v1.
- Windows PowerShell 5.1 mangles double quotes in native arguments: inner bash strings use single quotes only.
- System git config has core.autocrlf=true; the repo sets core.autocrlf false, core.longpaths true, extensions.worktreeConfig true, core.hooksPath .githooks.
- mwccarm hangs silently without LM_LICENSE_FILE; neither mwccarm nor dsd is in the pipeline (vendor/, gitignored, never pushed).

**Capacity rules (section 7.2):**
- All modes: WS0 counts toward the local instance cap.
- All modes: `vitest run --pool=threads --maxWorkers=2`, no watch mode.
- All modes: `make -j4` for runtime builds while more than two stream instances are active (always in hybrid and standard mode). `buildRuntime({jobs})` defaults to 8; the env block sets DSDUDE_MAKE_JOBS=4; `dsdude` also takes `--jobs N`.
- All modes: close the dev IDE and the emulator after each test.
- All modes: at most one Electron dev IDE machine-wide. Before opening a dev IDE or an emulator window, run `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue`; if the limit is reached, wait or use `dsdude screenshot` headless.
- All modes: per-package CLAUDE.md briefs stay at most 60 lines; read only the PLAN.md sections they cite (full PLAN.md is ~55K tokens).
- Memory gate (all modes, local launches): tools/memsampler.ps1 samples `\Memory\Available MBytes` and `\Memory\Committed Bytes` once a minute into C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\memsampler.log; tools/checkpoint.ps1 reports the minimum available memory and peak commit charge since the last checkpoint. Add a local instance only if minimum available memory stayed above 1.5 GB.
- Hybrid mode (the plan): the standard-mode limits below apply to the local instances; cloud sessions use no local RAM (peak ~4 local + 4-5 cloud on one plan). Keep Discord and Creative Cloud closed; one claude.ai/code tab may steer the cloud sessions.
- Standard mode (12 GB; fallback): at most 4 Claude Code instances (WS0 + 3 stream instances); at most one Electron dev IDE and one emulator window machine-wide; close the browser, Discord and Creative Cloud during sessions; streams run in three slots and pass the slot on at their hand-off point.
- Upgraded mode (32 GB; fallback after the RAM upgrade): WS0 + up to 7 stream instances in memory-gated waves; at most one Electron dev IDE machine-wide (WS6 only until CP-C); one emulator per worktree.
- Every spawned process gets a timeout. Never run pacman/wf-pacman after the phase0 tag.

**WS0 gotchas:**
- System git has core.autocrlf=true: Day 0 sets core.autocrlf false, core.longpaths true, extensions.worktreeConfig true, core.hooksPath .githooks before the first commit.
- Type-check with plain `tsc -b` (-b first); `--noEmit` on a referenced project fails with TS6310. Every package tsconfig: composite, declaration, emitDeclarationOnly, outDir 'dist-types'.
- Electron 42+ has no postinstall: without the root postinstall (`tools/postinstall.mjs`, which runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1`), electron-vite throws `Electron uninstall` and Playwright downloads 158 MB inside its timeout. Never set `DSDUDE_SKIP_ELECTRON` in a Windows worktree's env block (spike 13's throwaway-worktree check is the one exception).
- Ownership is enforced per non-merge commit in main..<ref> (local `wsN-<name>` or a cloud push target) using the `DSDude-WS:` trailer, so ws2-*/ws4-* cross-merges pass; the four shared-file rules (CHANGELOG append, new ADR files, WS7 builtins doc/example fields, WS0's integration-feedback appends) need field-level/append-only checks.
- List tool packages in test.projects by name (tools/gen-docs); a tools/* glob would also match plain scripts.
- The stable opcode set is exactly the 29 listed in section 5 C2; the ABI hash covers only the function, variable and constant entries of `builtins.json`, in the byte form of task 6.
- Flappy v0 sample: obj_gap needs `scored = false;` in create.dss (rule 1, R50x) and a sprite for its bbox; obj_ctrl is Visible off and needs `alarm[0] = 60;` in create.dss; rm_game is 256x192; the pipe geometry is ADR-0001 (task 4).
- Only WS0 regenerates package-lock.json, on Windows (commit-msg hook rejects it elsewhere); worktrees and cloud clones use npm install, never npm ci, and cloud clones restore the lockfile after every install. Never delete the lockfile while any `node_modules` exists (task 2).
- `vendor/` never reaches GitHub: `.gitignore` keeps `vendor/*` (plus the root-level `/mwccarm/` and `/dsd-windows-x86_64.exe` lines), and `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` other than `vendor/README.md`, or any `mwccarm/`, `license.dat` or `dsd-*.exe` path (task 3).
- `.ps1` files (`tools/checkpoint.ps1`, `tools/memsampler.ps1`, `tools/phase0/spike1-hooks.ps1`) are ASCII-only (or UTF-8 with BOM). Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI, and an em dash inside a double-quoted string then breaks parsing ("The string is missing the terminator").
- Hooks run under Git for Windows' `sh`: keep them LF with a `#!/bin/sh` line and call `node` for the TypeScript parts. Scripts that Node runs directly (`tools/*.ts`) must use erasable TypeScript syntax only (no enums, namespaces or parameter properties) with explicit `.ts` import extensions.
- `tsc -b` needs a list of projects: the root solution `tsconfig.json` (task 2) provides it and has a WS0 row in `ownership.json`, as does `tools/tsconfig.json`.
- Writers of goldens and traces use binary mode (Buffers in Node), and comparisons strip `\r` (section 3.4).
- Keep build paths under 250 characters (the root is 47 characters, and worktrees are its siblings `..\DSDude-ws<n>`).
- The spike-13 remainder (standard-mode fallback only) opens an Electron window: run the `Get-Process` check first and close it afterwards.

## References

- **PLAN.md:** 2.10, 3.4, 4, 5 (5.1, C1, C2, C6, C9, C13, C14), 6 intro and WS0, 7.1, 7.2 (hybrid mode and its fallbacks), 7.3, 7.4, 7.5, 8 phase0, 9 risks 10, 12, 13, 17, 19 and 22-28, and 10. Also 2.5 (the pinned stack), 2.8 (number rules for `language.md`) and 3.3 (collision rules for `events.md`).
- **Research:** `docs/research/README.md`, `docs/research/06-idestack.md`, `docs/research/07-design-panel-summary.md`, `docs/research/verification.md` (all claims; claim 8 for the npm pins).
- **Other kickoff files:** `docs/kickoff/README.md` (the user's launch guide; section 8 is the canonical cloud-session procedure) and `docs/kickoff/ws1.md` .. `ws8.md`, `ws6b.md` (you finalise them on Day 2).
