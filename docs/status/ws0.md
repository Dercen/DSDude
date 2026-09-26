# WS0 status: Lead: foundation, contracts, integration

Mode: **hybrid** (no fallback recorded). Schedule position: Phase 0 done (`phase0` tag, 2026-09-25); next CP-A at D+3.

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
- Task 7. Fixtures, conformance v0, contracts README/CHANGELOG, kickoff files, Status block, tag: done
  - `tools/phase0/make-fixtures.ts` -> `fixtures/assets/`; conformance v0 (5 programs + expected logs); `fixtures/bytecode/conformance/v0-01.dsda` (stable opcodes only): done (8a2eb9f)
  - `contracts/README.md` (C1-C14 index, owed list, tiers, events) and `contracts/CHANGELOG.md`; contract versions in every kickoff; briefs regenerated: done (995ff06)
  - WS1 merged (`19c3ce8`, see `docs/status/checkpoint-0.md`); its T1 changes to C4/C10 (0.2.0) accepted; `## Integration feedback` appended to `docs/status/ws1.md`: done
  - CLAUDE.md Status block, `pacman`/`wf-pacman` deny rules, `docs/status/checkpoint-0.md`: done (tag commit)
  - Definition-of-done run on a clean clone, then `phase0` and `toolchain-ok` tags: see "Definition of done" below

## Spike results

- **Spike 1 (hooks), 2026-09-25: 11/11 PASS** with `powershell -NoProfile -File tools\phase0\spike1-hooks.ps1` (throwaway worktree `..\DSDude-spike1` on `spike1-tmp`, scratch bare repo; all removed afterwards, no leftover paths or branches):
  1. WS1 commits `packages/toolchain/src/spike.ts`: exit 0, trailer `DSDude-WS: WS1`.
  2. WS1 commits `runtime/core/spike.c`: pre-commit rejects (exit 1, "owned by WS0").
  3. WS1 commits `samples/hello/Makefile` with CRLF bytes: exit 0, stored `i/lf`.
  4. WS0 stages `package-lock.json`: `wip` rejected by commit-msg; `chore(deps): regenerate lockfile` passes (guard runs).
  5. Merges bringing a lockfile change and `runtime/core/*.c`: pass without a conflict and with a resolved conflict; the merge commit gets the trailer.
  6. pre-push: clean `main` pushes; a `vendor/probe.txt` commit (the one `--no-verify`) is refused, and still refused after `git rm --cached` + commit.
  7. A second detached worktree checks out the Makefile and all three hooks as `i/lf w/lf`, with no CR bytes.
  - Permissions: `npm ci --help` is denied by `.claude/settings.json` ("Permission to use PowerShell with command npm ci --help has been denied"); `git status` runs without a prompt. The embedded form is caught too: with the tag commit's deny rules (`PowerShell(*pacman*)`, `Bash(*pacman*)` and the plain forms), `C:\msys64\usr\bin\bash.exe -lc 'echo wf-pacman --version'` was refused ("Permission to use PowerShell with command ... has been denied").
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
- ADR-0002 DeSmuME R4 slot-1 profile does not mount NitroFS: **accepted** by the user (2026-09-25). DeSmuME launches
  only with its default slot-1 device; flashcart-style boots wait for hardware (spike 15).

- ADR-0003 key-script format (WS1): **superseded** by WS2's C8 0.2.0 `--input` format (user decision, 2026-09-26).
  **Next WS1 session** (with the compileProject/packAssets wiring): switch `dsdude screenshot --keys` and
  `tools/screenshot.py` to the C8 format, update `contracts/cli.md` (T1), drop the `ADR-pending ADR-0003` marker.
  If WS1 does not run again before CP-C, this goes to `docs/kickoff/ws8.md` with the other leftovers.

## Integration log

- 2026-09-26 checkpoint-1 (`tools/checkpoint.ps1`, first run): WS1, WS4, WS2 and WS6 merged green (37 test files,
  223 tests); lockfile regenerated; MSYS2 host goldens green on WS2's `Makefile.host`; hello screenshot read back
  (blue top, bottom text "DSDude hello / emulator: (none) / log: legacy stub / hello"). T1 reviews accepted: C4 0.5.0
  and C10 0.4.0 (WS1; `PackAssetsFn` gains `outDir`, fine because WS5 has not started), C5 0.2.0 (WS6; stub
  narrowings with no other consumer yet); WS4's T0 language.md clarifications accepted. The report's 224 MB memory
  minimum is the laptop waking from a battery sleep (04:17-07:05), not the integration; since 07:09 the minimum is
  2898 MB. `start-ws3` tagged.

- **ADR numbers (WS0, 2026-09-26):** three ADRs were filed as 0003 on the same day. Final numbers by arrival on main: ADR-0003 key-script format (WS1); ADR-0004 platform seam (WS3); **ADR-0005** provisional opcode operands (WS4, co-signed by WS2; was 0003); **ADR-0006** sprite geometry in the DSDB (WS2; renamed when WS2's branch merges).

## For WS7's launch message (CP-A)

- From WS6 (2026-09-26): Learn links are `dsdude-learn:/docs/<path>.md#<anchor>` with GitHub-style heading slugs;
  Problems links go to `docs/reference/errors.md#<code lowercased>`; F1 goes to `docs/reference/functions.md#<name>`
  (`variables.md` for variables and constants). Documented in `apps/ide/src/renderer/panels/api.ts`; another form
  needs an ADR. The mock host is `@dsdude/ide/mock-host` (`fixtures/ide/mock-host`).
- From WS6 (2026-09-26, C5 0.7.0 TemplateIndexSchema in contracts/ipc.md): the New Project wizard reads
  `templates/index.json` as `{ "templates": [ { "id": "flappy", "title": "Flappy Bird", "description": "...", "dir": "flappy" } ] }`;
  `id` matches /^[a-z0-9-]+$/, `description` is optional (default ""), `dir` is a folder under `templates/` holding a
  complete C1 project; list order is wizard order; the template whose id or title matches /flappy/ is preselected.
  Until the file exists the wizard offers a built-in Empty (and `samples/*` in dev builds). Another shape is a T1/ADR on C5.
- The c_* colour constants are in builtins.json since 2026-09-26 (ids 143-158; docs/examples are TODO(WS7)).

## Integration log (continued)

- 2026-09-26 checkpoints 4-7 (event-driven, batch merges): every stream merged green; the c_* colours landed as
  builtins 0.2.0 (ABI hash 0xf1d376bb) once WS2's goldens stopped hard-coding the hash. WS5's Windows checks pass
  (real grit/mmutil, exact soundbank, cached packAssets 34 ms in-process). **`npx dsdude build samples/minimal`
  builds a real ROM end to end**, and its screenshot shows the player sprite at (128,96), 60 fps.
- Deviation noted (WS3): sound effects are not `mmEffectRelease`d after starting (PLAN.md 3.3 says release), so
  C11's `dsd_plat_sfx_stop` can still cancel them.
- ADR-0007 emulator key rebinding (WS6 -> WS1, C4 T1): **accepted** by the user (2026-09-26); implemented by WS1 as C4 0.6.0
  (DsButton, SUPPORTED_KEYS, LaunchOptions.keys, E625 warning with per-button fallback; verified with key presses in both
  emulators); merged at checkpoint-11. WS6 wires its rebinding page next.

- ADR-0004 platform seam: **resolved** (user, 2026-09-26) by WS2's C11 0.2.0/0.3.0, adopted by WS3; no markers left.

## Decisions (2026-09-26, user)

- **WS6b will not launch.** WS6 builds the visual editors (task 7) now; it already holds WS6b's paths
  (`apps/ide/src/renderer/editors/**`, `packages/editor-core/**`, `fixtures/editors/**`) and keeps them, since
  `start-ws6b` is never tagged.
- **Open question 4 (hardware):** an original Nintendo 3DS that runs `.nds` files through TWiLight Menu++. Hardware
  checks (spike 15, the scanline limits, the M1 hardware figure) run there in DS mode; results come back as on-screen
  output that the user reports.

## Hardware results (2026-09-26, user: original 3DS, TWiLight Menu++ default settings)

ROMs from WS3's hardware set, built ~11:54 from `runtime/dist` near main `0e67e27` (DTCM dispatch table and the
cheaper CALLN; not yet the watchdog change or the int ops). Read from the user's photos.
- **5-flappy.nds:** plays, with sound; bird and pipes on the top screen.
- **3-hello.nds:** `READY 0.1.0 f1d376bb`, `LOG hello`, `EXIT 0` (log protocol shown on screen, as C8 legacy mode).
- **4-numeric.nds (spike 12):** every line matches the host and melonDS values: trig 2802 7574, atan2 33076 23775,
  sqrt 20444 21605, div 51 59715, mul 47882 38740, lengthdir 29239 47856, string 5784 62728, random 43187 48735, EXIT 0.
- **2-bench.nds (M1):** VM 27.15 cycles/op, 41,261 ops/frame, "gate 35000: PASS"; loop 18.03 cycles/op (62,131
  ops/frame); frame 46.25 cycles/op, overhead 22,047 cycles/frame; load main 1.11 vs dtcm 0.85; cstack 3644/11200 B.
  **Provisional:** page 4 shows heap free 16,184 KB, so TWiLight ran the ROMs in DSi mode (16 MB; DS mode gives
  ~3 MB, as melonDS's 3040 KB), possibly with the ARM9 at 133 MHz. The gate figure counts only after a re-run with
  TWiLight's per-game settings "Run in: DS mode" and "ARM9 CPU speed: 67 MHz (NTR)" (asked of the user).
- **1-selftest.nds, spike 15 (scanline):** largest N with every ring whole: normal N=33 (2178 OBJ line cycles),
  affine N=15 (2070), affine2x N=8 (2128). With the next N costing 2244 / 2208 / 2394, the real limit lies in
  2178-2207 cycles (the page's budget estimate is ~2124; 1530 with DISPCNT bit 23). C13's 1200 warning is
  conservative. The 2D engine is the same in DS and DSi mode, so these hold.
- **Selftest page 3:** the error box is readable ("Your game stopped", R999, "START: restart").
- **Selftest page 4:** 0x04FFFA00 bytes 0-7 all 00, log protocol legacy (right on hardware); 1 MB NitroFS read in
  232 ms (4401 KB/s) ok; maxmod load=0 blip=0 loop=0 and bad id=1 handle=1 active=1, as expected; cstack
  3068/11200 B; heap free 16,184 KB (DSi mode, above).
- Relayed to WS3 (spike 15, page 4, bench) and WS2 (the bench figure, provisional).

## Open questions for the user

- The memory gate failed over Day 1 (1095 MB at 22:33, during WS1's install with emulators open); since 23:30 it
  passes (2432 MB). When to launch WS6 and WS3 locally (see the Day-2 report).
- P8 (branch selector): answered. WS2 and WS4 were opened on `main` (2026-09-25), and WS5 directly on `ws5-assets` (2026-09-26): the selector does offer stream lines. start.sh handles both.

## Notes for PLAN.md (fold in at CP-A)

- From WS1: BlocksDS 1.24.0's `examples/graphics_2d/bg_regular_nitrofs` has no Makefile (it uses `build.py`), so the
  7.1 Day-0 line and spike 6 should name `graphics_2d/bg_regular_8bit`, `filesystem/nitrofs` and `maxmod/nitrofs`;
  tool versions print as `v1.24.0-dirty`; `arm-none-eabi-gcc` lives under `C:\msys64\opt\wonderful\toolchain\gcc-arm-none-eabi\bin`;
  the install takes ~70 s, not ~30 min.
- A workspace package's new `bin` needs `npm install` twice in an existing tree: the first run records it in the
  lockfile, the second links it (fresh installs link it at once).

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

## End-of-day report: Day 2 (2026-09-25, late) — Phase 0 done

**Tags:** `phase0` on `313088a`; `toolchain-ok` on `19c3ce8` (the merge of WS1's gate commit). Mode: hybrid, no
fallback.

**Definition of done (section 6 WS0), each with its evidence:**
- **Clean clone green.** `git clone C:\Users\zache\OneDrive\Desktop\Projects\DSDude C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean`
  at `313088a` (system `core.autocrlf=true`, no repo config): `npm install` exit 0 (531 packages, 42 s);
  `npm run check` exit 0 (Biome 153 files, `tsc -b`, gen-opcodes/gen-builtins/gen-dsdb byte-identical);
  `npm test` exit 0 ("Test Files 27 passed (27), Tests 106 passed (106)"); `node_modules/electron/path.txt` present;
  `git status` clean afterwards. Then `Remove-Item -Recurse -Force ...\DSDude-clean`.
- **Commit hooks proven, merges included; pre-push proven; LF checkouts.** Spike 1, 11/11 PASS (Spike results
  above). The clean clone checks out `samples/hello/Makefile`, `runtime/gen/opcodes.h` and the three hooks as
  `i/lf w/lf` and `tools/checkpoint.ps1` as `i/lf w/crlf`, so `.gitattributes` wins over `core.autocrlf=true`.
- **Every Phase-0 contract has a version header and a CHANGELOG section;** `contracts/README.md` lists C3, C7, C11,
  `runtime-artifact.md` and the C12 panel API as owed, with owner and deadline (C4's `toolchain-api.md` was delivered
  by WS1 at 0.2.0).
- **`hello.dsdb` disassembles to `hello.dsda`:** `npx dsdb-dis fixtures/bytecode/hello.dsdb` equals the file byte for
  byte, and `dsdb-asm` reproduces `hello.dsdb` (also a test in `packages/dsdb`); the same holds for
  `fixtures/bytecode/conformance/v0-01.dsda`.
- **`docs/kickoff/wsN.md` exists for every stream** (ws0-ws8, ws6b), each with the contract versions at the tag.
- **Cloud pieces on `origin/main`; vendor history clean; probe step 3 green:** pushed since `47539d5`; the vendor
  check prints nothing; the probe passed (Cloud probe above).
- **Tag `phase0` exists and is pushed** (with this report).

**Contract versions at the tag:**

| Contract | File(s) | Version | Owner |
|---|---|---|---|
| C1 | `contracts/project-format.md`, `packages/project-format` | 0.1.0 | WS0 |
| C2 | `contracts/dsdb.md` | 0.1.0 | WS2 + WS4 |
| C2 | `contracts/opcodes.json`, `packages/dsdb` | 0.1.0 | WS4 (WS2 co-signs) |
| C2 | `contracts/builtins.json` (ABI hash `0x0dd9987a`) | 0.1.0 | WS0 |
| C4 | `packages/toolchain/src/api.ts`, `contracts/toolchain-api.md` | 0.2.0 | WS1 |
| C5 | `contracts/ipc.md`, `packages/ipc-contract` | 0.1.0 | WS6 |
| C6 | `contracts/language.md`, `contracts/events.md`, conformance v0 | 0.1.0 | WS4 |
| C8 | `contracts/log-protocol.md` | 0.1.0 | WS2 |
| C9 | `contracts/diagnostics.md` | 0.1.0 | WS0 |
| C10 | `contracts/cli.md` | 0.2.0 | WS1 |
| C12 | `packages/asset-pipeline/src/preview.ts` | 0.1.0 | WS5 |
| C13 | `contracts/runtime-limits.json` | 0.1.0 | WS2 |
| C3, C7, C8 artifact, C11, C12 panel API | - | owed | WS5, WS4, WS3, WS2, WS6 |

**Streams to launch next:**
- Cloud, now: **WS2** (`dsdude-ws2`, stream line `ws2-runtime-core`) and **WS4** (`dsdude-ws4`, `ws4-compiler`);
  `start-ws2`/`start-ws4` tagged and the stream lines pushed with this report.
- Local slot 3: **WS6** (`start-ws6` tagged), memory permitting (below).
- Local slot 2: **WS3**, released by `toolchain-ok`; `start-ws3` is tagged when the memory gate passes with WS6 running.
- CP-A (D+3): WS5 and WS7 (cloud). CP-B (D+7): WS6b (cloud) if usage limits allow.

**Memory:** the gate failed over the day (1095 MB at 22:33, during WS1's install with both emulators); since 23:30
it passes (2432 MB, 2753 MB free at the tag). Waterfox holds ~930 MB and three `claude` processes run.

**Deferred as ADRs:** none from WS0. ADR-0002 (WS1) awaits the user's decision; WS0 recommends accepting it.
