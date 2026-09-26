# WS0 status: Lead: foundation, contracts, integration

Mode: **hybrid** (no fallback recorded). Schedule position: Phase 0, Day 1 (2026-09-25).

## Day-0 answers (user, 2026-09-25)

- **Location:** stay in place at `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` (no move, no pointer README). OneDrive sync inactive.
- **BlocksDS install consent:** given at WS1's launch by approving its prompts.
- **Mode:** hybrid (local WS0 + WS1/WS3/WS6/WS8 at standard-mode limits; cloud WS2, WS4, WS5, WS7, optional WS6b).
- **Usage limits for ~4 local + 4-5 cloud sessions:** confirmed on Day 1 (2026-09-25): the user has Claude Max. Open question 3 closed.
- **Names:** confirmed: DSDude / DSS (`.dss`) / DSDB.
- **GitHub origin:** https://github.com/Dercen/DSDude.git, private. Claude GitHub App installed: yes.
- **Public releases and the unsigned installer:** decided by M6.
- **Day-0 steps done by the user:** `git init -b main` in place with the shared repo config (`core.autocrlf false`, `core.longpaths true`, `extensions.worktreeConfig true`, `core.hooksPath .githooks`); `mwccarm\` moved to `vendor\mwccarm\` and `dsd-windows-x86_64.exe` to `vendor\dsd\`; first commit `8f8f55d` (planning documents and the minimal `.gitignore`) pushed to `origin/main`.

## Phase 0 checklist

Legend: todo / in progress / done (<sha>).

### Day 1
- Task 1. Line endings and repo hygiene: done (896eb47, pushed)
- Task 2. Monorepo: done (60bb682, d554fcd; spike 13 below)
  - root `package.json`, `tsconfig.base.json`, solution `tsconfig.json`, `tools/tsconfig.json`, `biome.json`, `vitest.config.ts`: done (see git log)
  - `tools/postinstall.mjs`, `tools/check-lockfile.mjs`: done
  - 14 skeletons (`packages/*`, `apps/ide`, `tools/gen-docs`, `runtime`) with the pinned stack, briefs via `tools/phase0/gen-briefs.ts`: done
  - `LICENSE`, `runtime/LICENSE`, `README.md`: done
  - lockfile (`chore(deps): regenerate lockfile`): done
  - spike 13 (WS0 part): done, PASS (results below)
- Task 3. Hooks and governance tools: done (47539d5, a0a259d; cloud probe green, recorded in the next commit)
  - `tools/ownership.json`, `tools/check-ownership.ts` + walk test: done (47539d5)
  - `.githooks/pre-commit`, `commit-msg`, `pre-push` (+x): done
  - `tools/adr-pending.ts`, `tools/memsampler.ps1` (started 18:33, running), `tools/checkpoint.ps1` Day-1 part: done
  - `.claude/settings.json` cloud rules + SessionStart hook: done
  - spike 1 (`tools/phase0/spike1-hooks.ps1`): done, 11/11 PASS (results below)
  - cloud pieces (`tools/cloud/**`, `docs/status/cloud.md`, status stubs for WS2-WS8 and WS6b): done, pushed
  - cloud probe: done 2026-09-25, step 3 green (see Cloud probe)
- Task 4. Small contracts, C4 types, project format, samples: done (5c71867, b06a127)
  - C9 `diagnostics.md` + `Diagnostic` type, C1 `Project` + schemas + load/save, C4 `api.ts` + `MockBuildService`, C10 `cli.md`: done (5c71867); WS1 was not launched yet at the end of Day 1, see the report
  - C13 `runtime-limits.json`, C8 `log-protocol.md`, C5 `ipc.md` + `ipc-contract` zod stubs, C12 `preview.ts`: done
  - C1 `project-format.md` + schemas + load/save + E290-E299 catalog; tests load both samples and round-trip them byte for byte: done
  - `samples/minimal`, `samples/flappy` v0 (PNGs/WAVs from `tools/phase0/make-samples.ts`), ADR-0001: done

### Day 2 (2026-09-25/26)
- Task 5. `contracts/language.md` v0.1 (EBNF, precedence, numbers, printing, scopes, the 8 pinned rules + 3 small rules, program form, omissions) and `contracts/events.md` (24 event kinds in dsdb.md order, frame order, room load/change, Outside Room, same-screen collisions): done (see git log)
- Task 6. Minimal C2: done (see git log)
  - `contracts/dsdb.md` (container, cells, sections, calling convention, event ids, `.dsda` grammar, ABI hash), `contracts/opcodes.json` (29 stable + 22 provisional + 4 reserved), `contracts/builtins.json` (85 functions, 40 variables, 18 constants; 30 documented; ABI hash 0x0dd9987a): done
  - `tools/gen-opcodes.ts`, `tools/gen-builtins.ts`, `tools/gen-dsdb.ts` (all with `--check`, run by `npm run check`): done
  - `packages/dsdb` (encode/decode/assemble/disassemble, bins `dsdb-asm`/`dsdb-dis`), `fixtures/bytecode/hello.dsda` -> `hello.dsdb` (round-trips byte for byte): done
- Task 7. Fixtures, conformance v0, contracts README/CHANGELOG, kickoff files, Status block, tag: todo

## Spike results

- **Spike 1 (hooks), 2026-09-25: 11/11 PASS** with `powershell -NoProfile -File tools\phase0\spike1-hooks.ps1` (throwaway worktree `..\DSDude-spike1` on `spike1-tmp`, scratch bare repo; all removed afterwards, no leftover paths or branches):
  1. WS1 commits `packages/toolchain/src/spike.ts`: exit 0, trailer `DSDude-WS: WS1`.
  2. WS1 commits `runtime/core/spike.c`: pre-commit rejects (exit 1, "owned by WS0").
  3. WS1 commits `samples/hello/Makefile` with CRLF bytes: exit 0, stored `i/lf`.
  4. WS0 stages `package-lock.json`: `wip` rejected by commit-msg; `chore(deps): regenerate lockfile` passes (guard runs).
  5. Merges bringing a lockfile change and `runtime/core/*.c`: pass without a conflict and with a resolved conflict; the merge commit gets the trailer.
  6. pre-push: clean `main` pushes; a `vendor/probe.txt` commit (the one `--no-verify`) is refused, and still refused after `git rm --cached` + commit.
  7. A second detached worktree checks out the Makefile and all three hooks as `i/lf w/lf`, with no CR bytes.
  - Permissions: `npm ci --help` is denied by `.claude/settings.json` ("Permission to use PowerShell with command npm ci --help has been denied"); `git status` runs without a prompt. The embedded `bash.exe -lc '... wf-pacman ...'` form is checked in the tag commit, when the pacman deny rules are added.
- **Spike 13 (WS0 part), 2026-09-25: PASS.** Throwaway worktree `..\DSDude-spike13` (detached at `a0a259d`), removed afterwards:
  - `npm install`: exit 0 in 47 s, 531 packages, postinstall ran `install-electron`; `node_modules/electron/path.txt` = `electron.exe`; `git status` clean (lockfile not rewritten).
  - `npx tsc -b` clean: exit 0. With `export const broken: number = "not a number";` appended to `packages/dsdb/src/index.ts`: `error TS2322`, exit 2.
  - `path.txt` deleted, then `DSDUDE_SKIP_ELECTRON=1 npm install`: postinstall printed `DSDUDE_SKIP_ELECTRON=1, skipping install-electron`, exit 0, `path.txt` still absent.

## Cloud probe

Run by the user on 2026-09-25: environment `dsdude-ws4` (variables DSDUDE_WS=WS4, DSDUDE_PORT_BASE=5140,
DSDUDE_SKIP_ELECTRON=1, DSDUDE_MAKE_JOBS=4; README 8.1 setup script), repository `Dercen/DSDude`, branch `main`,
mode Auto. **Step 3 is green, so no fallback is needed.**
1. **Tools:** check-tools all OK; `node -v` v24.16.0 from /opt/node24/bin in a fresh Bash call; npm 11.13.0;
   gcc 13.3.0 (Ubuntu); GNU Make 4.3; `CLAUDE_CODE_REMOTE=true`, `DSDUDE_WS=WS4`.
2. **Clone:** not shallow; branches `main` + the session's own `claude/loving-archimedes-9m9ryx` (auto-created);
   no tags (none existed yet); fetch refspec `+refs/heads/*:refs/remotes/origin/*` (a full clone).
3. **Setup:** the SessionStart hook had already set `dsdude.ws=WS4`, `core.hooksPath` and `core.autocrlf`.
   `bash tools/cloud/start.sh` exit 0 in ~20 s (531 packages; "push target: none yet; behind origin/main by 0;
   latest checkpoint: none; open IF entries: 0"). `npm run check` passed (Biome 118 files, `tsc -b`);
   `npm test` 18 files / 39 tests passed. Linux native binaries from the Windows lockfile worked.
   - Finding: npm set the executable bit on the workspace bin target `packages/cli/src/main.ts` (100644 -> 100755),
     so every clone showed it modified. Fixed on `main` by committing it as 100755. Every future workspace bin
     (`packages/dsdb/src/cli-asm.ts`, `cli-dis.ts`) is committed with `git add --chmod=+x`.
4. **Trailer:** the empty commit got `DSDude-WS: WS4` (pre-commit and commit-msg ran in the Linux clone).
5. **Pushes:** `probe-plain` exit 0, `claude/probe-named` exit 0, the session's own branch exit 0. A plain
   branch name works, so each cloud stream pushes its `wsN-<name>` line directly (push.sh's first choice).
   WS0 deleted all three branches afterwards (2026-09-25).
6. **Network:** under the first network setting, `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`
   were blocked (403, no `x-deny-reason`; "no rule or allowlist entry allows host"), and `npx playwright install
   chromium` failed. The user switched the environment to **Full**. Then both hosts answered, `npx playwright install
   chromium` exit 0 (Chrome for Testing 153.0.8010.12 in /opt/pw-browsers, ~650 MB per new container), and a plain
   `chromium.launch()` rendered a page headless. `api.github.com` 400 and `raw.githubusercontent.com` 301
   (reachable) under both settings. The image also has Chromium 141 at /opt/pw-browsers/chromium as a fallback.
7. **Permission modes:** the session ran in Auto; the session API accepts default, plan, acceptEdits, dontAsk,
   bypassPermissions and auto.
- **P8 (branch selector):** only `main` was offered, but `main` was the only branch on origin at the time, so this
  is inconclusive. start.sh adopts the stream line from `main` either way; the answer shows at the first launch.
- **Working push order:** `wsN-<name>` (plain names are accepted); `claude/wsN-<name>` and the session's own
  branch also work as fallbacks.
- **Environments:** Network **Full** for all five (README 8.1 updated). Cloud gcc is 13.3 vs 15.2 locally; WS0's
  Windows run of the host goldens covers the difference.

## Open ADRs

- ADR-0001 Flappy pipe geometry: **accepted** by the user (2026-09-25) and applied to `samples/flappy` (two 128-px pipes around the 48-px gap).

## Open questions for the user

- After the cloud probe: did the claude.ai/code branch selector offer branches other than `main` (P8)?

## End-of-day report: Day 1 (2026-09-25)

**Done, with SHAs (all pushed to `origin/main`):**
- Task 1 `896eb47`: `.gitattributes`, `.editorconfig`, `.npmrc`, full `.gitignore`, `vendor/README.md`, `.claude/settings.json` v1, Status block, this file.
- Task 2 `60bb682` + `d554fcd` (lockfile): root config, 14 skeletons with the PLAN 2.5 pins, `tools/postinstall.mjs`, `tools/check-lockfile.mjs`, briefs via `tools/phase0/gen-briefs.ts`, licences, README. Spike 13 PASS.
- Task 3 `47539d5` + `a0a259d`: `tools/ownership.json`, `tools/check-ownership.ts` (+ walk test), the three hooks, `tools/adr-pending.ts`, `tools/memsampler.ps1` (running since 18:33), `tools/checkpoint.ps1` (-MemoryOnly/-AdrOnly), cloud scripts, registry, status stubs, settings cloud rules + SessionStart hook. Spike 1 11/11 PASS.
- Task 4 `5c71867` + `b06a127`: C9, C1 (types, schemas, load/save, spec, E290-E299), C4 `api.ts` + `MockBuildService`, C10 draft, C13, C8, C5 stubs, C12 preview types, `samples/minimal`, `samples/flappy` v0, ADR-0001.

**`npm run check && npm test` on Windows (end of Day 1):** `biome check` "Checked 118 files ... No fixes applied", `tsc -b` exit 0; Vitest "Test Files 18 passed (18), Tests 39 passed (39)".

**Vendor check:** `git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md'` prints nothing.

**Memory gate** (`tools/checkpoint.ps1 -MemoryOnly`, 13 samples): minimum available 1786 MB, peak commit 17.5 GB, PASS; but only WS0 was running, so the margin for WS1 + WS6 is thin.

**WS1:** its inputs (`packages/toolchain` + `packages/cli` skeletons, `api.ts` + `MockBuildService`, `contracts/cli.md`, `contracts/diagnostics.md`, `contracts/log-protocol.md`, `contracts/ipc.md`) are on `main` since `5c71867`/`b06a127`. No `ws1-toolchain` worktree existed at the end of Day 1, so WS1 has not been told in its own session yet: its kickoff has it run `git merge main` and `npm install` once the skeleton is on `main`, which is now.

**Day 2 plan:** task 6 first (`dsdb.md`, `opcodes.json`, the `builtins.json` signatures, the generators, `packages/dsdb`, `hello.dsda/.dsdb`), then task 5 (`language.md`, `events.md`), then task 7 (fixtures, conformance v0, `contracts/README.md` + `CHANGELOG.md`, kickoff finalisation, Status block, pacman deny rules, the clean-clone DoD run, the tag).
