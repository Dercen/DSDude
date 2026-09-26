# WS2 kickoff: Runtime core (portable C, host-tested)

You build the DSDB loader, the computed-goto VM, the number model and the engine core as portable C11 behind `dsd_platform.h`. `dsdude-host` (`dsdude-host.exe` on Windows) runs that core on the PC and is the oracle for WS4's compiler and WS3's DS port. WS2 is a **cloud stream** (hybrid mode): a Claude Code cloud session in environment `dsdude-ws2` on the private GitHub repo, pushing `ws2-runtime-core`. You build and test with Linux gcc. WS0 checks the MinGW build and WS3 the DS build locally, and their failures come back as `IF-` entries in `docs/status/ws2.md`.

## Paste this to start

```text
You are workstream **WS2: Runtime core (portable C, host-tested)** on DSDude, a GameMaker-like Nintendo DS IDE, running as a Claude Code **cloud session** (Ubuntu VM, no Windows tools).

- **Start:** run `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS2`, then `bash tools/cloud/start.sh` (10-minute timeout). Report failures rather than working around them.
- **Read:** `docs/kickoff/ws2.md` (its "Cloud setup" block replaces the Windows setup, env block and machine facts), `docs/kickoff/README.md` section 8, your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md`, your contract files, and only the `PLAN.md` sections they cite.
- **Paths and pushing:** write only the paths `tools/ownership.json` gives WS2. Your stream line is `ws2-runtime-core`; push only with `bash tools/cloud/push.sh`, after every green batch.
- **Never:** commit `package-lock.json`, run `npm ci`, edit root config or `vendor/`, or run Windows tools, emulators or Electron.
- **Tests and merges:** run `make -f runtime/Makefile.host test` before each commit, with a timeout on every process. Merge `origin/main` daily, and never rebase once WS0 has merged your commits.
- **Blockers:** if a contract blocks you, write `docs/adr/NNNN-<title>.md`, mark the workaround `// ADR-pending ADR-NNNN`, and continue.
- **Status:** fix open `## Integration feedback` entries in `docs/status/ws2.md` first, and never edit that section. The VM is ephemeral, so your branch and `docs/status/ws2.md` are your only memory: keep the file current and continue from it.

Your briefs are CLAUDE.md and runtime/CLAUDE.md. Operating mode: hybrid (cloud session); the CLAUDE.md Status block is authoritative. Then begin with task 1 under "First tasks" in docs/kickoff/ws2.md.
```

## When this stream starts

- **Hybrid mode (the plan):** a cloud session from the `phase0` tag (D, day 2), alongside WS4 (cloud) and WS6 (local slot 3); no local RAM, no slot. CP-A D+3 (C11 freezes); CP-B = M0 (D+7, week 2); CP-C = M1 (D+14, week 3); weekly after that; M2 week 4-5.
- **Fallbacks** (PLAN.md section 7.2; WS0 records a switch in the CLAUDE.md Status block and re-plans at the next checkpoint):
  - *Standard* (cloud or GitHub unavailable for more than a day, every push target refused, or usage limits beyond staggering): slot 2 at the tag, with WS0, WS1 and WS4; CP-B = M0 (~D+7-10); CP-C = M1 (~week 4-5); slot 2 passes to WS7 at your definition of done (~week 5-6). Move with "Local fallback" below.
  - *Upgraded* (after a RAM upgrade): at the tag, with WS4 and WS6, in the cloud or moved home the same way.
- **Gate:** `git tag phase0` (WS0: C2, C6, C14). If day 3 ends without the tag, WS0 tags `phase0` on main's last green commit anyway and delivers the missing items as ADRs (section 7.1). A cloud start also needs a green Phase-0 cloud probe; otherwise WS0 records the fallback.

The tag brings the C2 container, 29 stable opcodes, `runtime/gen/*.h`, `packages/dsdb`, `hello.dsda|.dsdb`, `language.md` v0.1, `events.md` and conformance v0. No emulator is needed until CP-B, and the cloud never runs one.

## Setup (cloud session)

**Cloud setup.** Environment `dsdude-ws2` (user, once; README section 8): network Custom (default package-manager list plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`); variables `DSDUDE_WS=WS2`, `DSDUDE_PORT_BASE=5120`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`; the shared setup script (Node v24.16.0 in `/opt/node24`, `gcc` and `make`, Playwright 1.63.0 Chromium). Stream line `ws2-runtime-core`. Port base 5120 goes unused: WS2 has no browser tests and needs no Playwright/Chromium. Linux test before every commit: `make -f runtime/Makefile.host test`.

| Cloud verifies | Verified locally on Windows (watch `## Integration feedback` in `docs/status/ws2.md`) |
|---|---|
| Ubuntu gcc build of `runtime/build-host/dsdude-host`; conformance tiers, deterministic `--seed` traces, UBSan trap; goldens in `fixtures/conformance/expected/**` | WS0: `mingw32-make -f runtime/Makefile.host test` (gcc 15.2) on the same goldens, the DoD's cross-compiler identity check; builds `fixtures/runtime-core/flappy-nitrofs/` with local grit/mmutil. WS3: the DS compile of the core, spikes 12 and 14, the M1 benchmark |

1. **Launch (user).** When WS0 says "launch WS2 (cloud)" (it has tagged `start-ws2` and pushed `main`, the tags and `ws2-runtime-core`), open claude.ai/code or `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-ws2`: repository `<user>/dsdude`, branch `ws2-runtime-core` (or `main` if not offered), environment `dsdude-ws2`, mode **Auto** if offered, else Accept edits. Paste the block above, rename the session `WS2 runtime-core`, and give WS0 the session URL and the branch the session reports.
2. **First commands** (repo-local git config is not cloned):
   ```bash
   git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS2
   bash tools/cloud/start.sh     # 10-minute tool timeout
   ```
   start.sh adopts the stream line without discarding work, runs the lockfile guard and `npm install` (`DSDUDE_SKIP_ELECTRON=1` skips `install-electron`), smoke-tests the Linux native binaries and prints the `gcc`/`make` versions. If it stops on divergence, note that in `docs/status/ws2.md` and tell the user. Record its last line in the status file, with `Linux gcc check: done in the cloud`. If start.sh fails after its fetch-and-adopt step (in the lockfile guard, `npm install` or the native smoke test, which cover the IDE stack WS2 does not use), report it as the paste block says, then continue with make-only work: tasks 1-3 need only `gcc` and `make`. Only `npx dsdb-asm` and `node tools/gen-dsdb.ts` must wait.
3. **Linux env** (set by the SessionStart hook and the environment; no MSYS2/Wonderful block). If a fresh Bash call shows a `node -v` other than v24, run it and note that in the status file:
   ```bash
   export PATH=/opt/node24/bin:$PATH
   export DSDUDE_HOME=$HOME/.dsdude
   export DSDUDE_SKIP_ELECTRON=1 DSDUDE_MAKE_JOBS=4
   export DSDUDE_PORT_BASE=5120   # set by the environment; unused by WS2
   ```
4. **npm and the lockfile.** `npm install` only, never `npm ci`; never stage or delete `package-lock.json`; `git restore package-lock.json` after every install. If the guard (`node tools/check-lockfile.mjs`) fails: leave the lockfile alone, write `BLOCKER lockfile` in the status file, push, tell the user, and meanwhile `npm install --no-save <missing>@<version>` (never `--force`). WS2 owns no npm package; request dependencies by ADR.
5. **Branch and push.** WS0 creates `ws2-runtime-core` from `start-ws2`. Push only with `bash tools/cloud/push.sh`, after every green batch; it refuses commits that touch `package-lock.json` or lack the trailer (fix: `git commit --amend --no-edit --trailer 'DSDude-WS: WS2'`), then tries the recorded target, `ws2-runtime-core`, `claude/ws2-runtime-core` and the session's own branch. On "NEW push target", put `` Cloud push target: `<t>` `` under the title of `docs/status/ws2.md`, commit, run push.sh again and tell the user. Never push `main` or tags, force-push or open PRs.
6. **Resume.** Never end a turn with unpushed work: a reclaimed VM keeps the conversation but loses processes and unpushed files. Reopen the same session and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/ws2.md." Replace only an archived or unusable session: same environment, the paste block plus "continue from docs/status/ws2.md", new URL to WS0. `/compact` works; `/clear` does not.

**Local fallback** (only when WS0 records it): `git fetch origin; git worktree add -B ws2-runtime-core ..\DSDude-ws2 origin/<push target>` in the repo root, then the worktree setup of `docs/kickoff/README.md` section 3 (`git config --worktree dsdude.ws WS2`, PLAN.md section 7.5 env block with `DSDUDE_HOME` = `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws2\.dsdude`, port base `5120`). The test becomes `mingw32-make -f runtime/Makefile.host test`; `where.exe gcc` must list `C:\msys64\ucrt64\bin\gcc.exe` first, version 15.2.0 (without it on PATH, gcc exits 1 with no message).

## Owned paths and contracts

**Contract versions at the `phase0` tag** (the index with owners and freeze points is `contracts/README.md`; the history is `contracts/CHANGELOG.md`): every Phase-0 contract is **0.1.0** — C1 project format, C2 `dsdb.md` + `opcodes.json` + `builtins.json` (ABI hash `0x0dd9987a`), C4 `api.ts`, C5 `ipc.md` stubs, C6 `language.md` + `events.md`, C8 `log-protocol.md`, C9 `diagnostics.md`, C10 `cli.md` draft, C12 `preview.ts` types, C13 `runtime-limits.json`. Owed, each by its owner: C3 `assetpack.md` (WS5, first day), C4 `toolchain-api.md` (WS1, CP-A), C7 `host.ts` (WS4, CP-B), C8 `runtime-artifact.md` (WS3, first `runtime/dist` build), C11 `dsd_platform.h` (WS2, CP-A), C12 panel API + mock-host (WS6, CP-A).

**Owned** (`tools/ownership.json`, from the tag): `runtime/core/**` (including the R5xx catalog `runtime/core/diagnostics/catalog.json`), `runtime/host/**`, `runtime/Makefile.host`, `runtime/tests/**`, `runtime/CLAUDE.md`, `fixtures/bytecode/**`, `fixtures/runtime-core/**` except `fixtures/runtime-core/flappy-nitrofs/**` (a WS0 row: WS0 builds it locally with grit/mmutil), `fixtures/conformance/expected/**`, `contracts/log-protocol.md`, `contracts/runtime-limits.json`, `contracts/dsdb.md` (co-owned with WS4; either may commit), `docs/status/ws2.md` except its `## Integration feedback` section (WS0 appends; never edit it). You co-sign changes to `packages/dsdb/**`, `contracts/opcodes.json` and `contracts/events.md` (WS4-owned).

**Not yours:** everything else, notably WS3's `runtime/platform/ds/**` and `runtime/Makefile`, WS4's `.dss` programs, root config, `vendor/`, `docs/status/cloud.md` and `package-lock.json`; `runtime/gen/**` changes only with its generator input. `.githooks/pre-commit` runs `tools/check-ownership.ts` (against `origin/main` in the cloud) and `.githooks/commit-msg` adds the `DSDude-WS: WS2` trailer; WS0's integration re-checks every non-merge commit in `main..origin/<your push target>` and refuses the merge on a violation. `contracts/CHANGELOG.md` and new `docs/adr/NNNN-*.md` files are append/create only.

| Contract | Files | Role |
|---|---|---|
| C8 Runtime log protocol | `contracts/log-protocol.md` | owner |
| C11 Platform seam | `runtime/core/include/dsd_platform.h` | owner; frozen at CP-A |
| C13 | `contracts/runtime-limits.json` | owner, seeded by WS0; values change by T1 |
| C2 DSDB | `contracts/dsdb.md`; `packages/dsdb` + `contracts/opcodes.json`; `contracts/builtins.json` | co-owner with WS4; mandatory co-signer; consumer |
| C6 Language spec | `contracts/language.md`, `contracts/events.md`; `fixtures/conformance/expected/**` | consumer (co-signs `events.md`); owner of expected outputs |
| C3 Asset pack layout | `contracts/assetpack.md` | consumer |
| C9 Diagnostics | `contracts/diagnostics.md` | consumer; owns the R5xx catalog `runtime/core/diagnostics/catalog.json` |
| C14 | `fixtures/bytecode/bench.dsda` | producer |

## First tasks

Sources go in `runtime/core/src/`, headers in `runtime/core/include/` (WS3's `runtime/Makefile`: `SOURCEDIRS := core/src platform/ds/src`, `INCLUDEDIRS := core/include gen`). The DS build compiles every `.c` under `core/src` recursively, so host-only code goes in `runtime/host/` and tests in `runtime/tests/`. Include generated headers by bare name (`#include "opcodes.h"`, `"builtins_table.h"`), with `-Iruntime/gen` in `Makefile.host`.

1. **Values and numbers** (sections 2.4, 2.8). `value.h`: 8-byte cells `{u32 tag; s32 payload}`, `static_assert`ed. `fixed.c`: Q20.12 with 64-bit intermediates; one division path testing `den == 0` and `INT_MIN / -1` first, then modelling DIV_64_32 (truncate toward zero, low 32 bits); `sqrtf32` as floor(isqrt((u64)a << 12)); the libnds `source/arm9/trig.c` and `include/nds/arm9/trig_lut.h` that BlocksDS 1.24.0 ships, with a `math.h` shim; the octant-LUT `atan2`. `runtime/tests/`: division equivalence (den 0, `INT_MIN / -1`, negatives, quotients over 32 bits), trig LUTs, `string(n)` formatting.
   - The cloud has no `$BLOCKSDS`: take `trig.c` and `trig_lut.h` from the GitHub mirror blocksds/libnds (upstream codeberg.org/blocksds/libnds may be outside the environment's allowlist) at the commit the 1.24.0 SDK release pins. Find that commit with `curl -fsSL "https://api.github.com/repos/blocksds/sdk/contents/libs/libnds?ref=v1.24.0"` (the `sha` of the submodule entry; confirm the tag name first with `git ls-remote --tags https://github.com/blocksds/sdk`), then fetch `https://raw.githubusercontent.com/blocksds/libnds/<sha>/<path>`. Put them in `runtime/core/src/vendor/` and `runtime/core/include/vendor/`, keep the SPDX Zlib header, and record the commit hash at the top of each file. If neither host is reachable, record a blocker in `docs/status/ws2.md` and tell the user.
   - The printing and angle rules are the ones `contracts/language.md` pins (PLAN.md section 2.8); if it differs, it wins. `string(n)` rounds half away from zero at the second decimal of the exact Q20.12 value (0.125 prints `0.13`, 1/3 prints `0.33`). `point_direction` returns degrees as Q20.12 in [0, 360), counter-clockwise with y pointing down as in GML, exact at multiples of 45.
   - Create `runtime/Makefile.host` with a `test` target now, following the rules under gotchas: it is your pre-commit command from the first commit.
2. **Loader, VM, host runner.** `loader.c` checks magic, version and ABI hash (mismatch: *"This ROM was built for a different DSDude runtime"*). `vm.arm.c`: the 29 stable opcodes first, 4 KB register stack, 64-register frames. `runtime/host/`: the host platform and `dsdude-host <nitrofs-dir> --frames N --input keys.txt --trace out.jsonl [--png-dir dir] [--seed N]`. Run `hello.dsdb` (copied as `game.dsdb`): `DSD|READY` and `DSD|LOG|hello` once each, then `DSD|EXIT|0` (program form, `contracts/dsdb.md`).
   - Define the `--input` key-script format (one line per change: `<frame> <held keys joined by +, or ->`; touch as `T<x>,<y>`) and the JSONL trace schema (one object per frame, fixed key order, integers only, LF endings) in a "Host runner" section of `contracts/log-protocol.md`, as a T1 change before CP-A. WS4 compares against the trace, and WS1's `dsdude screenshot --keys` reads the same key format.
3. **By CP-A (D+3): publish `dsd_platform.h`** with every section 5 C11 call plus named room-load primitives (blank screens, free the previous set, load effects and music). Draft it during task 2. `runtime/Makefile.host` builds with Linux gcc here, and with MSYS2 UCRT64 gcc 15.2 in WS0's integration (see gotchas).
4. **By D+7:** `strings.c`/`arrays.c`/`heap.c` on fixed arenas, `show_debug_message`, `debug.c` writing the C8 lines; v0 and v1 execution goldens in `fixtures/conformance/expected/`. Hand-assemble into `fixtures/bytecode/` until WS4's `dsdude compile` output is available.
   - Assemble with `npx dsdb-asm in.dsda -o out.dsdb` (`packages/dsdb`'s bin). Commit only the `.dsda` plus the `.dsdb` that `node tools/gen-dsdb.ts` regenerates in the same commit (a generated path).
   - The v1 programs are WS4's conformance programs 6-10. Until they are on `main`, hand-write v1 test programs as `fixtures/bytecode/v1-*.dsda`, and file an ADR draft if WS4's v1 `.dss` files are not on `main` by D+5.
5. **`fixtures/bytecode/bench.dsda`**: the M1 op mix (40% tag-checked ADD/SUB/MUL, 30% MOV/LOADI/GETSLOT/SETSLOT, 20% CMPJ/JMP, 10% CALLN/RET) as a >= 4 KB straight-line block. CMPJ and GETSLOT/SETSLOT are provisional; WS4 promotes them (T1) with your co-signature.
6. **Engine, tier by tier:** `instances.c`, `events.c` (C6 order, inheritance, `with`, GETDYN/SETDYN), motion, `collision.c`, `alarms.c`, `anim.c`, `drawlist.c` (section 3.3 OAM rules), `rooms.c` (section 3.2), `builtins/*.c`, the 300-instance stress fixture.
7. **Spikes with WS3:** 12 (numeric hashes: host `-O0`, `-O2`, trap vs an ARM9 ROM on melonDS, by CP-C) and 14 (M1 benchmark variants, at M1). You supply the host side from the Linux build; WS3 runs the DS side locally and WS0 the MinGW build. Results go into `docs/status/ws2.md` (WS3's side: `git show origin/main:docs/status/ws3.md`); a failure becomes an ADR.

## Definition of done (section 6 WS2)

- `make -f runtime/Makefile.host test` (Linux gcc, here) and `mingw32-make -f runtime/Makefile.host test` (MSYS2 UCRT64 gcc 15.2, WS0's integration) run every conformance tier that has landed and match the expected logs and traces. The tier schedule is v0-v1 by D+7, v2 by ~D+14, v3 by ~D+21-28 and v4 (rooms and draw) by ~D+28-35, in time for M2 (hybrid week 4-5). Only goldens for builtins added later come after M2, as short WS2 sessions.
- `dsdude-host <flappy build>/nitrofs --frames 600 --seed 1 --input fixtures/runtime-core/flappy-keys.txt --trace out.jsonl` is deterministic across runs and identical between the MinGW and Linux gcc builds. `<flappy build>` is `dsdude compile samples/flappy` output plus `dsdude assets samples/flappy` once WS5's `packAssets` exists. Before then, and in the cloud (no grit/mmutil), the GRFs and soundbank come from `fixtures/runtime-core/flappy-nitrofs/`, which WS0 makes locally with the installed grit/mmutil from the `samples/flappy` PNGs/WAVs (section 2.9 command lines; ask in your status file). The Linux half runs here, the MinGW half in WS0's integration.
- `DSD|ERR` lines carry object/event/file/line.
- The core compiles unchanged under the DS Makefile (WS3), with no `#ifdef __NDS__` outside `dsd_platform.h` implementations. WS3 and WS0 check this locally.
- The M1 gate is met, measured with WS3's timer harness: >= 35,000 typed simple ops per full 1,120,380-cycle frame. On melonDS the bar is >= 44,000 unless a hardware run calibrates the derating (section 8 M1). Below the gate, WS2 first adds the reserved int-specialised opcodes.

**Hand-off.** Hybrid (and upgraded): runs to its definition of done, then perf work alongside WS3 while usage limits allow. It keeps its owned paths; later fixes (open `IF-` entries, goldens for builtins added after M2) run as short WS2 cloud sessions in `dsdude-ws2` (paste block plus "continue from docs/status/ws2.md"). Standard fallback: hands slot 2 to WS7 at its definition of done (~week 5-6); later fixes run as short local WS2 sessions when a slot is free or at a checkpoint.

## Testing in isolation and verifying without eyes

**Isolation (verbatim):** Hand-assembled .dsda fixtures from packages/dsdb, host build only; no emulator needed until CP-B. Host-side work can run as a cloud session (Linux gcc build of Makefile.host).

- Every `dsdude-host` run passes `--seed N`; compare traces byte-for-byte after stripping `\r`. Read `--png-dir` frames with the Read tool.
- **From CP-B, with WS3's ELF:** `dsdude play` `DSD|` lines and `dsdude screenshot` PNGs need emulators. WS0 verifies this locally at integration; watch the integration-feedback list in `docs/status/ws2.md` and `docs/status/checkpoint-N.md` (`git show origin/main:<path>` after each fetch) and fix open `IF-` entries first. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading and push; WS0 re-runs the check and appends the resolved line.

## Coordination

- `docs/status/ws2.md`: tier status, spike results, leftovers, open `ADR-pending` markers, start.sh's version line, and the `Cloud push target:` line once push.sh asks for it. The `## Integration feedback` section at its end belongs to WS0.
- **Tiers (section 7.4).** T0 doc text: commit with a CHANGELOG line. T1 additive (e.g. a limit key): version bump, CHANGELOG entry, regenerated outputs and fixtures in one commit. T2 breaking: co-signed ADR. Weeks 1-4: WS0 merges C2/C6/C11 changes within 24 h; `ws2-*`/`ws4-*` may cross-merge. Take WS4's push target `<t>` from `docs/status/cloud.md` on `origin/main`, then run `git fetch origin '+refs/heads/<t>:refs/remotes/origin/<t>' && git merge origin/<t>`.
- **Daily:** `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`, the test, and push.sh. Never rebase once WS0 has merged any of your commits. Other streams' ADRs and status files reach you only through `origin/main`, after WS0 integrates and pushes.
- **At a checkpoint** (CP-A/B/C, then weekly, plus the hand-off): commit, update `docs/status/ws2.md`, push with `bash tools/cloud/push.sh`, then stop touching the branch until the user relays "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..." (README section 5), and do what the relay says: the VM may have been reclaimed while you waited. CP-A freezes C11; CP-B expects hello and v0/v1 goldens; CP-C runs the M1 gate.

## Machine limits and gotchas

- **Cloud VM:** Ubuntu, Linux gcc (the image's; start.sh prints it) and GNU make; no MSYS2, BlocksDS, grit/mmutil, emulators, py-desmume or Electron. Keep `DSDUDE_MAKE_JOBS=4`. Never install system packages (setup-script changes go through a WS0 ADR) or leave background processes running (full list: README section 8).
- Use the Bash tool; time-box every spawn with its timeout parameter (<= 600000 ms; `run_in_background` for longer) or `timeout 600 <cmd>`.
- **`runtime/Makefile.host`** builds with Linux gcc here and with MSYS2 UCRT64 gcc 15.2 under WS0's `mingw32-make`:
  - identical flags on both: `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char` (plus `-Wall -Wextra -DDSD_HOST`); no `-Werror` (GCC 13 and 15 warn differently); `-fsanitize=undefined -fsanitize-trap=undefined` on both, as a variant the `test` target also builds;
  - `ifeq ($(OS),Windows_NT)` only for `EXE := .exe`;
  - recipes that run in both cmd.exe and `/bin/sh`: `mingw32-make` (GNU Make 4.4.1) uses cmd.exe when no `sh.exe` is on PATH, as with WS0's env block (verified 2026-09-25: `mkdir -p` fails with 'The syntax of the command is incorrect'). Keep each recipe to a single `$(CC)` call or a run of a built executable; create output directories and compare traces inside a C test runner in `runtime/tests/`; never use `mkdir -p`, `rm -rf`, `diff` or `cmp`. Linux green does not prove the cmd.exe path; WS0's run does;
  - always invoked from the repo root as `make -f runtime/Makefile.host <target>` (here) or `mingw32-make -f runtime/Makefile.host <target>` (WS0's integration; WS4 uses `make -f runtime/Makefile.host` in its cloud session), so paths are relative to the root; output goes to `runtime/build-host/` (gitignored).
- **Portability (risk 25):** fixed-width integers only (`long` is 32-bit on Windows, 64-bit on Linux); plain char is signed on both hosts, unsigned on ARM; size_t/pointers are 8 bytes on host, 4 on DS, so cells hold 32-bit handles, never pointers, and struct layouts are static_asserted; no reliance on more than 1 MB of stack (Linux's 8 MB hides overflows).
- UBSan only in trap mode (no libubsan); -fwrapv disables +,-,* overflow instrumentation, so the debug trap uses __builtin_{add,sub,mul}_overflow; trap exits show as SIGILL (status 132) on Linux, 0xC000001D on Windows.
- No floats, no libc qsort/rand/%f: own xorshift32, stable sort, number formatting; division through core functions handling den == 0 and INT_MIN / -1.
- RNG seed: a non-zero DSDB header seed wins; otherwise dsd_plat_rng_seed() (dsdude-host --seed N on the host). Traces and goldens always pass a seed; files opened "wb" (MinGW text mode would add \r), comparisons strip \r.
- Semantics: reading a never-assigned slot raises R50x; with iterates a snapshot of ids and unwinds through WITHEND; parents include descendants; global.* cleared only by game_restart; audio_play_music is a no-op if already playing; room changes take effect at end of frame; Outside Room fires once on leaving.
- Instance blocks are 384 bytes (~180 B native struct + up to 24 user cells); room arena 512 KB; watchdog 200,000 instructions per frame (R510).

## References

- `PLAN.md`: 2.3, 2.4, 2.8, 3.2 (room asset sets and room changes), 3.3, 4, 5 (C2, C3, C6, C8, C9, C11, C13), 6 WS2, 7.1 (spikes 12 and 14), 7.2 (hybrid mode and fallbacks), 7.4, 8 (M1, M2, M4), 9 (risks 3, 4, 5, 18, 25, 26).
- `docs/kickoff/README.md` section 8 (cloud sessions: environments, start.sh, push.sh, lockfile rules).
- `docs/research/04-priorart.md`, `docs/research/05-hardware.md`, `docs/research/verification.md` claims 4, 11, 13. The stack VM in 04 and the 1-1.5 MB room arena in 05 are superseded.
