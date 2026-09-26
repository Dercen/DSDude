# WS1 kickoff: Toolchain, build driver and Play

You make an ELF plus a NitroFS folder boot as a `.nds`, with the window visible, in melonDS and DeSmuME on this machine, behind `BuildService` (C4) and the `dsdude` CLI (C10). You install BlocksDS 1.24.0 at hour zero with the user present, pass `toolchain-ok`, and deliver the M0 pieces: `packRom()`, `EmulatorManager`, log capture, `BuildService` and `dsdude screenshot`. Your paths later pass to WS8.

## Paste this to start

```text
You are workstream **WS1: Toolchain, build driver and Play** on DSDude, a GameMaker-like Nintendo DS IDE. Read `docs/kickoff/ws1.md` first, then your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md` and the contract files listed for you; read the `PLAN.md` sections they cite, not the whole file. Work only inside the paths `tools/ownership.json` assigns to you; WS0's integration refuses anything else. Edit only the contract files `tools/ownership.json` assigns to you (T0/T1 directly, T2 via ADR; section 7.4); never edit root config files or `package-lock.json`; never run `pacman`/`wf-pacman`; put a timeout on every process you spawn. If a contract blocks you, write `docs/adr/NNNN-<title>.md` with a proposed change, mark your workaround `// ADR-pending ADR-NNNN`, and continue. Branch `ws1-toolchain` in worktree `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1`; merge `main` into your branch daily (never rebase once WS0 has merged any of your commits); small commits; run `npm test -w packages/toolchain` (or `mingw32-make -f runtime/Makefile.host test` / `make -j4` for the runtime) before each commit. Keep to the capacity rules of section 7.2: `vitest run --pool=threads --maxWorkers=2`, no watch mode, close the dev IDE and the emulator after each test. You cannot see emulator windows: verify with `DSD|` lines and `dsdude screenshot` PNGs. Keep `docs/status/ws1.md` current. Test in isolation using the fixtures and mocks named below; do not wait for other streams. Report blockers as ADR drafts.
Operating mode: hybrid, local session in slot 1 (the CLAUDE.md Status block is authoritative). Your one exception: the section 7.1 install runs wf-pacman at hour zero, before the phase0 tag, with the user present; the user gives install consent by launching you and approving your prompts. Read CLAUDE.md, packages/toolchain/CLAUDE.md, packages/toolchain/src/api.ts, contracts/cli.md, contracts/log-protocol.md, contracts/diagnostics.md and contracts/ipc.md (at hour zero, whichever exist). Then begin with task 1 under "First tasks" in docs/kickoff/ws1.md.
```

## When this stream starts

- **Hybrid mode (the plan):** local, slot 1, at hour zero (Day 0). The user is present for the ~30 min install (no UAC prompt, MSYS2 packages untouched); launching you and approving your prompts is the install consent (open question 1). Only WS0 and WS1 run in Phase 0.
  - At the tag (D): WS6 takes local slot 3, and WS2 and WS4 start as cloud sessions.
  - Your `toolchain-ok` starts WS3 in slot 2 (not before the tag, memory gate permitting). CP-A is at D+3.
  - CP-B = M0 (D+7): WS6 wires your real `BuildService` into IDE Play.
  - You continue until CP-C = M1 (D+14), when slot 1 passes to WS8 (see Hand-off).
- **Fallbacks (PLAN.md section 7.2; WS0 records a switch in the CLAUDE.md Status block):** upgraded mode is the same as hybrid for you. Standard mode hands slot 1 to WS3 at M0 (~week 2, ~D+7-10).
- **Depends on:** WS0's Phase-0 C4 types (`packages/toolchain/src/api.ts`) and the C10 draft (Day 1). The install waits for nothing.
- **Hour zero:** `main` holds only the Day-0 commit (the docs plus a minimal `.gitignore`), so your worktree exists (Setup) but has no `package.json`; skip `npm install`. Run task 1 from the worktree; it writes only under `C:\msys64`, `%TEMP%`, your `DSDUDE_HOME` (`C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude`) and `docs/status/ws1.md`. The Day-0 `.gitignore` already ignores `.dsdude/` and `vendor/*`; still stage only your own paths. Create `docs/status/ws1.md` without the `## Integration feedback` heading: WS0 appends it on `main` after its first merge of your branch, and you never edit that section. Once WS0's Day-1 skeleton is on `main` (check with `git log main --oneline`), run `git merge main`, then `npm install` with a 10-minute tool timeout (the first run downloads Electron). If `git merge main` reports that an untracked `package-lock.json` would be overwritten, delete that untracked file (`Remove-Item package-lock.json`) and merge again.

## Setup (PowerShell)

Paste this whole block into one PowerShell window. The env block comes before `claude`, and `claude` is the last line:

```powershell
# Run in PowerShell. <n> = 1; <name> = toolchain (PLAN.md section 7.5 table)
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
git worktree add ..\DSDude-ws1 -b ws1-toolchain
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1
git config --worktree dsdude.ws WS1
# Per-instance env block (PLAN.md section 7.5)
$env:DSDUDE_HOME = 'C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude'
$env:DSDUDE_PORT_BASE = '5110'   # electron-vite dev server = base; Vitest browser mode / Playwright = base+1..base+9
$env:DSDUDE_MAKE_JOBS = '4'   # hybrid and standard mode always; upgraded mode while more than two stream instances run (buildRuntime default is 8)
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = "C:\msys64\opt\wonderful\bin;$env:PATH;C:\msys64\ucrt64\bin"   # ucrt64\bin last: host gcc and mingw32-make need it (section 2.4); without it gcc exits 1 with no message
if (Test-Path package.json) { npm install }   # absent at hour zero; never npm ci in worktrees
claude
```

At hour zero there is no `package.json`, so the guarded `npm install` does nothing; an unguarded one would fail and still leave an untracked `package-lock.json` behind.

## Owned paths and contracts

**Contract versions at the `phase0` tag** (the index with owners and freeze points is `contracts/README.md`; the history is `contracts/CHANGELOG.md`): every Phase-0 contract is **0.1.0** — C1 project format, C2 `dsdb.md` + `opcodes.json` + `builtins.json` (ABI hash `0x0dd9987a`), C5 `ipc.md` stubs, C6 `language.md` + `events.md`, C8 `log-protocol.md`, C9 `diagnostics.md`, C12 `preview.ts` types, C13 `runtime-limits.json`; WS1 has already taken C4 (`api.ts` + `toolchain-api.md`) and C10 `cli.md` to **0.2.0** (T1). Owed, each by its owner: C3 `assetpack.md` (WS5, first day), C7 `host.ts` (WS4, CP-B), C8 `runtime-artifact.md` (WS3, first `runtime/dist` build), C11 `dsd_platform.h` (WS2, CP-A), C12 panel API + mock-host (WS6, CP-A).

**Owned:** `packages/toolchain/**` (including the E6xx catalog `src/diagnostics/catalog.ts`), `packages/cli/**`, `tools/fetch-vendor.ps1`, `tools/screenshot.py`, `tools/tools-pack.json`, `scripts/install-toolchain.ps1`, `scripts/smoke-test.ps1`, `samples/hello/**`, `fixtures/runtime/hello/**`, `fixtures/build/**`, `contracts/toolchain-api.md`, `contracts/cli.md`, `docs/manual/setup/**`, `docs/status/ws1.md`.

Ownership rules:
- Before the tag you write only these entries. Before the tag WS0 may also write the `packages/toolchain` and `packages/cli` skeletons, `api.ts` + `MockBuildService` and the `contracts/cli.md` draft; take them by merging `main`.
- The whole entry passes to WS8 at the `start-ws8` tag: CP-C in hybrid (and upgraded) mode, or when WS8 starts in slot 1 in the standard-mode fallback.

**Not yours:** root config, `package-lock.json` (commit only your `package.json`), `runtime/**`, `fixtures/runtime/**` outside `hello/`, `contracts/log-protocol.md`, `apps/ide/**`. Hooks: pre-commit runs Biome and `tools/check-ownership.ts` (reads `dsdude.ws`); commit-msg adds `DSDude-WS: WS1` and rejects a staged lockfile. The real check is WS0's integration: one foreign path in any non-merge commit of `main..ws1-toolchain` refuses the merge.

| Contract | Files | Role |
|---|---|---|
| C4 Toolchain driver API + BuildService | `packages/toolchain/src/api.ts`, `packages/toolchain/src/index.ts`, `contracts/toolchain-api.md` | owner; implements the Phase-0 types, confirmed at CP-A |
| C10 CLI | `contracts/cli.md`, `packages/cli` | owner; final |
| C14 hello fixtures | `samples/hello`, `fixtures/runtime/hello/**`, `fixtures/build/**` | producer, at `toolchain-ok` |
| C5 IPC channel map | `packages/ipc-contract`, `contracts/ipc.md` | consumer |
| C8 Runtime log protocol | `contracts/log-protocol.md` | consumer; `samples/hello` uses the one-protocol writer |
| C9 Diagnostics | `contracts/diagnostics.md` | consumer; owns the E6xx catalog |

## First tasks

1. **Install (hour zero, user present).**
   - Do the install once, and treat it as spike 4. Write a Node script under `%TEMP%\dsdude-spikes\` that runs the section 7.1 bash steps one by one: `spawnSync('C:\\msys64\\usr\\bin\\bash.exe', ['-lc', step], {env, timeout, windowsHide: true})`, using the block's env and checking every exit code. Log the output of wf-tools runs 1 and 2 and of the `-Syu` after `wf-config repo enable blocksds` into `docs/status/ws1.md`.
   - Do the downloads, the melonDS hash check, the extraction into your `DSDUDE_HOME` and the `python -m pip install --user py-desmume==0.0.9` step in PowerShell as in the block, with `$ProgressPreference = 'SilentlyContinue'` and `Invoke-WebRequest -UseBasicParsing`.
   - Start the script with the tool's `run_in_background` and poll its log file: a foreground tool call is killed after 2 minutes by default (10 at most), and the `blocksds-toolchain` step may take 30. If a wf-pacman run is ever interrupted, stop and tell the user before retrying, because it leaves its `db.lck` behind.
   - Then turn the same steps into `scripts/install-toolchain.ps1`: every step exit-code-checked and time-limited, with 30 min for the `blocksds-toolchain` download.
   - Until WS0's `packages/toolchain` and `packages/cli` skeletons are on `main`, create nothing under those folders (it would cause an add/add conflict with WS0's skeleton). Keep spike scripts under `%TEMP%\dsdude-spikes\` and copy their results into `docs/status/ws1.md`.
   - The toolchain counts as installed when `C:\msys64\opt\wonderful\bin\wf-config` and `...\thirdparty\blocksds\core\tools\ndstool\ndstool.exe` exist. The user confirms that the example ROM shows its background.
   - Finish before the tag. The fallbacks are the Inno `.exe` `/CURRENTUSER` (plan B, only with the user's OK) and devkitPro (plan C, only via ADR) (section 2.1).
   - Spikes (full list in the section 7.1 table; results go into `docs/status/ws1.md`):
     - 3: `bash.exe -lc pwd` from Node with `SHLVL` removed, with and without `CHERE_INVOKING=1`.
     - 4: the install above, driven from Node, with wf-tools runs 1 and 2 recorded. Expect gcc 16.2.0, tools at v1.24.0, and no core update from the second `-Syu`.
     - 2: first close the melonDS window the Day-0 block opened (`taskkill /IM melonDS.exe`, then `/F` after 2 s). Then spawn melonDS with and without `windowsHide`, and check `IsWindowVisible`.
2. **`toolchain-ok` (day 1-3).** Everything in this task is on the gate's critical path (PLAN.md section 8).
   - `detectToolchain()` checks ndstool/grit/mmutil, `arm7_maxmod.elf` and `arm-none-eabi-gcc.exe` (section 6 WS1). Build `dsdude toolchain status --json` on it.
   - `buildRuntime({jobs})` = `` spawn('C:\\msys64\\usr\\bin\\bash.exe', ['-lc', `make -j${jobs}`], {cwd, env}) ``, with the Wonderful env of section 6 WS1.
   - Spike 6: `make VERBOSE=1` from Node in the two SDK examples. These become `scripts/smoke-test.ps1`.
   - `samples/hello`: a `rom_arm9` Makefile. `main.c` runs `nitroFSInit`, reads `nitro:/hello.txt` and prints `DSD|LOG|hello` with the C8 writer:
     - the emulator ID at `0x04FFFA00` picks `0x04FFFA10` (melonDS/no$gba, line carries `\n`) or a legacy-signature RAM stub;
     - no `nocashMessage()`, and buffers in main RAM;
     - then >= 5 `DSD|PAD|` lines of <= 1023 chars.
   - Spikes 8 (log path, duplicates, graceful-Stop flush) and 9 (NitroFS offsets/magic, empty `-d`, boot in both emulators and py-desmume).
   - Copy `arm9.elf` + `hello.nds` into `fixtures/runtime/hello/`. The same run fills `fixtures/build/hello/`: the build directory that `dsdude build samples/hello --skip-compile --skip-assets` produced (`nitrofs/hello.txt`, `game.nds`) and `packrom.json`, the `packRom()` info (header offsets, sizes, magic). The E6xx tests and `createFakeToolchain()` read them.
   - `packRom()`/`verifyRom()`: the ndstool line of section 3.2 step 6, then the header check. Failures are E6xx.
   - A first `EmulatorManager.launch → {onLine, stop}`, with emulators under `<DSDUDE_HOME>\emulators\` (DeSmuME copied). It writes `melonDS.toml` (key map, `IntegerScaling=true`, `3D.Renderer=0`, `Screen.UseGL=false`, `ShowOSD=false`).
   - `samples/hello` is a BlocksDS C project with no `project.json`. With `--skip-compile --skip-assets`, `dsdude build <dir>` packs `<dir>/nitrofs/` as the NitroFS root, passes `-b C:\msys64\opt\wonderful\thirdparty\blocksds\core\sys\icon.bmp`, and uses the folder name as the title. `<project-hash>` is the first 16 hex digits of the SHA-256 of the lower-cased absolute project path. Write these rules into `contracts/cli.md` and `contracts/toolchain-api.md`.
   - `dsdude build samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets && dsdude play samples/hello --no-build` in melonDS and DeSmuME. Builds go to `<DSDUDE_HOME>\build\<project-hash>`.
   - Spike 7: `tools/screenshot.py` behind `dsdude screenshot <rom> --frames N [--keys file] --out dir`.
     - The interpreter is `python` on PATH, the Microsoft Store CPython 3.13.14 (also `py -3.13`); do not use the 3.10 install.
     - py-desmume 0.0.9 is installed with the user present at hour zero (`python -m pip install --user py-desmume==0.0.9`, part of the section 7.1 block). It goes into the user site, which every worktree shares. Pillow is already installed: record `python -m pip show Pillow` in `docs/status/ws1.md`. After that, `dsdude doctor` only reports them.
     - Spawn `python` with `windowsHide`, a timeout, `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy`, and call `cycle(with_joystick=False)`.
   - **Declare the gate.** When the section 8 criteria pass (install script, hello builds, header check, hello boots in melonDS and DeSmuME with `DSD|LOG|hello` captured, `dsdude screenshot` returns a PNG), commit and put `toolchain-ok: passed <date> <commit>`, with the log excerpt and PNG paths, at the top of `docs/status/ws1.md`. Then stop touching the branch until WS0 reports the merge; WS0 tags `toolchain-ok` on main.
3. **CLI polish (week 1).**
   - EmulatorManager hardening: `ensureInstalled` with the melonDS 1.1 SHA-256 check, the persisted PID and start time with `taskkill /T` reconciliation, and GDB 3333/3334 only for Debug.
   - `--keys` uses the key-script format of `contracts/log-protocol.md`, "Host runner" (WS2). WS2 is a cloud stream, so until that section lands on `main`, read its draft with `git show origin/<target>:contracts/log-protocol.md`, where `<target>` is WS2's push target in `docs/status/cloud.md` (WS0's integration run fetches it; `git fetch origin` only if the ref is missing). Never merge a cloud branch. Mark the code `// ADR-pending`.
   - C10: flags `--runtime --skip-compile --skip-assets --emulator melonds|desmume --no-build --seed N --jobs N --json`; exit codes 0 ok, 1 user-input diagnostics, 2 tool/environment failure.
4. **`BuildService` (confirmed at CP-A).**
   - It implements the Phase-0 types. `createFakeToolchain()` stays in sync with `MockBuildService`.
   - Cancellation, graceful Stop and the basic DeSmuME profile.
   - `dsdude` registers every package's `cliCommands`.
   - Wire WS4's `compileProject` and WS5's `packAssets` and `checkRoomBudgets` as they land on `main` (by CP-B). Both are cloud streams: their work reaches you only through `git merge main`, after WS0 has integrated their `origin` branches. `BuildService` receives them injected; the `dsdude` CLI in `packages/cli` wires them (C4), because `@dsdude/toolchain` must not import them. Whatever has not landed by CP-C (or by your hand-off in the standard-mode fallback) goes to WS8 as a leftover.
   - Write `contracts/toolchain-api.md` and the final `contracts/cli.md`.
5. **If time remains:** spike 5 (tools pack: `tools/fetch-vendor.ps1`, `tools/tools-pack.json`, the clean-PATH test) and `dsdude doctor`. Otherwise both go to WS8.

## Definition of done (section 6 WS1)

- The install script completes unattended on this machine with no UAC prompt, and `dsdude toolchain status --json` reports every path.
- toolchain-ok: `dsdude build samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets && dsdude play samples/hello --no-build` boots in melonDS and DeSmuME with the emulator window visible and `DSD|LOG|hello` captured live (flush pad) or at graceful Stop, with no duplicate lines on melonDS; `dsdude screenshot` returns both PNGs.
- `buildRuntime()` succeeds when spawned with SHLVL unset, as under Electron.
- `packRom()`'s header check passes on hello, and each of these fixture ROMs triggers E6xx (docs/research/verification.md claim 3): one with its `NitroFS!` magic zeroed, one with its FAT size zeroed (both hex-patched by the test), and one packed from an empty `-d` folder.
- 20 consecutive Play launches leave no orphan emulator.
- Each worktree's emulator config lives only under its `DSDUDE_HOME`.
- The tools-pack clean-PATH test passes, or is recorded in `docs/status/ws1.md` as a WS8 leftover.

**M0 (section 8), at CP-B (D+7).** Your part: `dsdude play samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets` shows `DSD|LOG|hello` live, and Stop leaves no orphan, in melonDS and in DeSmuME. Hybrid mode uses the upgraded-mode M0, which also needs WS6's IDE Play on your real `BuildService` and WS3's selftest ROM. In the standard-mode fallback M0 is CLI-only.

**Hand-off.** Hybrid (and upgraded) mode: continue until CP-C (D+14), commit your last WS1 work with its leftovers in `docs/status/ws1.md` (dsdude doctor, tools pack, DeSmuME-profile polish, and wiring compileProject/packAssets into BuildService for whichever has not landed), and stop. WS0 merges and tags `start-ws8`, and slot 1 continues as WS8: `claude` restarts in C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8 from docs/kickoff/ws8.md. Standard-mode fallback: hand slot 1 to WS3 at M0 (~week 2) once packRom(), EmulatorManager, log capture, BuildService and dsdude screenshot work; the same leftovers go to WS8 via docs/kickoff/ws8.md, and between the hand-off and WS8's start WS0 handles fixes to WS1's paths and toolchain ADRs (the one exception to the short-session rule).

## Testing in isolation and verifying without eyes

**Isolation (verbatim):** Tests mock child_process; real-tool tests skip when detectToolchain() fails; the hello ELF stands in for the runtime.

Mocked tests assert four things about every spawn: its argv, its env (`CHERE_INVOKING=1`, the PATH prefix, a POSIX `BLOCKSDS`), `windowsHide` (set for tools, absent for emulators), and a timeout. The E6xx ROMs are derived from `hello.nds` inside the test.

Cloud streams (WS4, WS5) import `api.ts` and `MockBuildService` on Linux, so keep module import free of Windows-only side effects. Real-tool tests skip there, because `detectToolchain()` fails.

**Without eyes.**
- `DSD|` lines (C8), captured by `EmulatorManager` with the `DSD|PAD|` lines dropped.
- `dsdude screenshot` PNGs, read with the image-capable Read tool.
- Window visibility: `(Get-Process melonDS).MainWindowHandle -ne 0`.
- Orphans: `Get-Process melonDS, DeSmuME* -ErrorAction SilentlyContinue` is empty after the 20 launches.

Ask the user only about an ambiguous screenshot.

## Coordination

- `docs/status/ws1.md`: progress, every spike result (a failed spike becomes an ADR), and your leftovers at hand-off.
- **Tiers (section 7.4).** WS4, WS5, WS6 and WS8 consume `api.ts`. After CP-A, an additive change is T1: minor bump plus a `contracts/CHANGELOG.md` entry, in one commit. A breaking change is T2 and needs an ADR. Toolchain changes are your ADRs, applied at a checkpoint.
- Merge `main` daily, after `git restore package-lock.json`. Never rebase once WS0 has merged any of your commits.
- **Cloud streams** (WS2, WS4, WS5, WS7, optional WS6b) push to `origin`. WS0 fetches them, integrates them into `main` and pushes `main` and the tags back, so their work reaches you only through `git merge main`. You are a local stream: never push, and never merge `origin/*`.
- **Integration feedback.** `docs/status/ws1.md` ends with `## Integration feedback` (WS0 adds the heading after its first merge of your branch), where WS0 appends `IF-` entries (a shared-file exception). Fix open entries first and never edit that section. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading; WS0 re-runs the check and appends the resolved line.
- **At each checkpoint** (CP-A, CP-B, CP-C, weekly, and the hand-off): commit, update your status file, then stop touching the branch until WS0 reports the merge.

## Machine limits and gotchas

- **Capacity.** At most one emulator window machine-wide (hybrid mode keeps the standard-mode local limits). Check `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue` first, and close the emulator after each test. Runtime builds use `make -j4`.
- **Shell tool.** Use the PowerShell tool for builds, tests and spawns (CLAUDE.md, "Which shell tool"). In PowerShell, `timeout` only sleeps: time-box with the tool's timeout parameter or `run_in_background`.
- **bash.** Always spawn `bash.exe -lc` with `CHERE_INVOKING=1`; without it the shell runs `cd $HOME` and you get 'No targets specified'. `BLOCKSDS` stays a POSIX path. Match the PATH key case-insensitively. PowerShell 5.1 mangles double quotes, so inner bash strings use single quotes.
- **PATH.** Prefix `C:\msys64\opt\wonderful\bin`, or the tools exit 0xC0000135 silently. `objdump.exe` needs `C:\msys64\ucrt64\bin` on PATH.
- **Spawning.** Emulators get `stdio:'pipe'` and no `windowsHide`; tools and python get `windowsHide` and a timeout. Stop is `taskkill /PID`, 2 s, then `/F`; wait for the exit before rewriting `melonDS.toml`. Persist the PID and start time under `DSDUDE_HOME` and reconcile with `taskkill /T`.
- **ndstool.** Always pass `-7`. Delete partial outputs, and keep paths under 250 chars. `ndstool -i` does not report the `NitroFS!` magic.
- **Keys.** The melonDS.toml key map uses Qt codes: A=88, B=90, X=83, Y=65, L=81, R=87, Start=16777220, Select=16777248, Up=16777235, Down=16777237, Left=16777234, Right=16777236. `desmume.ini [Controls]` takes Windows virtual-key codes for the same mapping.
- **DeSmuME.** Copy `DeSmuME_0.9.13_x64.exe` from `C:\Users\zache\Downloads\desmume-0.9.13-win64\` to `<DSDUDE_HOME>\emulators\desmume-0.9.13\`, never under `%TEMP%` (its ini would move). ROM paths must be ASCII.
- **py-desmume.** Needs `SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy` and `cycle(with_joystick=False)`. Its image is 256x384, so split it into top and bottom. Only BlocksDS ROMs boot. Detect a hang from the pixels, not `is_running()`.
- **Tools pack.** Take DLLs only from `C:\msys64\opt\wonderful\bin`, via a recursive `objdump -p` walk. They must import `api-ms-win-crt-*`. No `ldd.exe`.
- **mwccarm and dsd.** Never spawn `mwccarm`: without `LM_LICENSE_FILE` it hangs silently. Neither tool is in the pipeline (section 2.2).
- **Line endings.** `.gitattributes` gives `*.ps1` CRLF and Makefiles LF (system git has `core.autocrlf=true`; the repo sets `false`).
- **`.ps1` encoding.** `scripts/install-toolchain.ps1`, `scripts/smoke-test.ps1` and `tools/fetch-vendor.ps1` are ASCII-only (or UTF-8 with BOM). Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI, and an em dash inside a double-quoted string then breaks parsing ("The string is missing the terminator").

## References

- `PLAN.md`: 2.1, 2.2, 2.6, 3.1, 3.2, 5 (C4, C8, C10, C14), 6 intro and WS1, 7.1 (Day-0 script, spikes 2-9), 7.2 (hybrid mode and its fallbacks), 8 (toolchain-ok and M0), and risks 1, 2, 7, 8 and 20 in section 9.
- `docs/research/01-toolchain.md`, `docs/research/02-mwccarm.md`, `docs/research/03-emulator.md`, and `docs/research/verification.md` claims 1, 2, 3, 6, 7 and 10.
