# WS8 kickoff: Integration, QA and release (inherits WS1's paths)

You inherit WS1's toolchain, build driver and CLI (C4, C10), finish its leftovers, and build `npm run e2e`, CI, the NSIS installer, the license bundle and the release checks. You integrate each milestone and file regressions to their owners until release 0.1 (M6).

## Paste this to start

```text
You are workstream **WS8: Integration, QA and release (inherits WS1's paths)** on DSDude, a GameMaker-like Nintendo DS IDE. Read `docs/kickoff/ws8.md` first, then your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md` and the contract files listed for you; read the `PLAN.md` sections they cite, not the whole file. Work only inside the paths `tools/ownership.json` assigns to you; WS0's integration refuses anything else. Edit only the contract files `tools/ownership.json` assigns to you (T0/T1 directly, T2 via ADR; section 7.4); never edit root config files or `package-lock.json`; never run `pacman`/`wf-pacman`; put a timeout on every process you spawn. If a contract blocks you, write `docs/adr/NNNN-<title>.md` with a proposed change, mark your workaround `// ADR-pending ADR-NNNN`, and continue. Branch `ws8-release` in worktree `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8`; merge `main` into your branch daily (never rebase once WS0 has merged any of your commits); small commits; run `npm test -w packages/toolchain` and `npm test -w packages/cli` (or `mingw32-make -f runtime/Makefile.host test` / `make -j4` for the runtime) before each commit. Keep to the capacity rules of section 7.2: `vitest run --pool=threads --maxWorkers=2`, no watch mode, close the dev IDE and the emulator after each test. You cannot see emulator windows: verify with `DSD|` lines and `dsdude screenshot` PNGs. Keep `docs/status/ws8.md` current. Test in isolation using the fixtures and mocks named below; do not wait for other streams. Report blockers as ADR drafts.
Read packages/toolchain/CLAUDE.md, packages/cli/CLAUDE.md, the contracts listed in docs/kickoff/ws8.md and docs/status/ws1.md (plus ws3.md in the standard fallback). Operating mode: hybrid, local stream in slot 1 (the CLAUDE.md Status block is authoritative; follow this file's standard or upgraded lines only if WS0 has recorded that fallback there). Never push: WS0 publishes `main` to `origin`, and the cloud streams reach you only through `main`. Then begin with task 1 under "First tasks".
```

## When this stream starts

- **Hybrid mode (local stream, slot 1 after WS1):** at CP-C (D+14, M1, week 3) WS1 commits its last work, WS0 merges it and tags `start-ws8`, and the user closes WS1's window and starts `claude` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8` (Setup), so the local count stays at 4 (WS0, WS8, WS3, WS6). Part-time weeks 3-6, full-time from week 6 to release. WS3 keeps slot 2 to its definition of done, so its M4 stress check and hardware notes stay with WS3.
- **Fallbacks** (PLAN.md section 7.2; only if the CLAUDE.md Status block records one, and WS0 then re-plans at the next checkpoint): **standard** (GitHub or cloud sessions unavailable for more than a day, every push target refused, or staggering cannot absorb the usage limits): slot 1 after WS3 hands off (after M1, ~week 5-6), full-time until release. **Upgraded** (after a RAM upgrade): as hybrid.
- **Gates:** WS0 has merged `ws1-toolchain` (standard fallback: also `ws3-platform`), and the `start-ws8` tag exists on main, so `tools/ownership.json` assigns WS1's entry to WS8 (else ask WS0). Standard fallback: read the toolchain ADRs WS0 handled after M0.
- **Integration targets:** WS1-WS6, plus WS7's content, which the installer packages. WS2, WS4, WS5, WS7 and WS6b are cloud sessions and reach you only through `main` (Coordination). **Release 0.1:** hybrid week 12-14 (M5 week 10-11); standard fallback week 16-20 (M5 week 15-17); upgraded fallback week 12 (M5 week 9-10). An installer build must exist before M5.

## Setup (PowerShell)

```powershell
# Run in PowerShell. <n> = 8; <name> = release (PLAN.md section 7.5 table)
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
git worktree add ..\DSDude-ws8 -b ws8-release
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8
git config --worktree dsdude.ws WS8
# Per-instance env block (PLAN.md section 7.5). Set in the worktree's PowerShell before starting `claude`.
$env:DSDUDE_HOME = 'C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8\.dsdude'
$env:DSDUDE_PORT_BASE = '5190'   # electron-vite dev server = base; Vitest browser mode / Playwright = base+1..base+9
$env:DSDUDE_MAKE_JOBS = '4'   # hybrid and standard mode always; upgraded mode while more than two stream instances run (buildRuntime default is 8)
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = "C:\msys64\opt\wonderful\bin;$env:PATH;C:\msys64\ucrt64\bin"   # ucrt64\bin last: host gcc and mingw32-make need it (section 2.4); without it gcc exits 1 with no message
npm install          # never npm ci in worktrees
claude
```

## Owned paths and contracts

**Owned** (`tools/ownership.json`, section 3.4):
- WS1's paths from the hand-off: `packages/toolchain/**` (including the E6xx catalog), `packages/cli/**`, `tools/fetch-vendor.ps1`, `tools/screenshot.py`, `tools/tools-pack.json`, `scripts/install-toolchain.ps1`, `scripts/smoke-test.ps1`, `samples/hello/**`, `fixtures/runtime/hello/**`, `fixtures/build/**`, `contracts/toolchain-api.md`, `contracts/cli.md`, `docs/manual/setup/**`.
- `tests/e2e/**`, `.github/**`, `apps/ide/electron-builder.yml`, `scripts/release.ps1`, `scripts/ci.ps1`, `CHANGELOG.md`, `docs/qa/**`, `docs/status/ws8.md`.
- Appends to `contracts/CHANGELOG.md` for your own contracts, and new `docs/adr/NNNN-*.md` files.

**Not yours:** root config (ask WS0 for the root `e2e` script), the rest of `apps/ide/**` (WS6), `runtime/**` (WS2/WS3), `templates/**`, `docs/tutorial/**`, `docs/reference/**` (WS7), other streams' fixtures.

**Enforcement:** `pre-commit` runs Biome and `tools/check-ownership.ts` (stream from `git config --worktree dsdude.ws`); `commit-msg` adds `DSDude-WS: WS8` and rejects `package-lock.json`. The real check is WS0's integration: each non-merge commit in `main..ws8-release` is checked against `tools/ownership.json` at main's HEAD, and a violation refuses the merge.

| Contract | Files | Role |
|---|---|---|
| C4 Toolchain driver API + BuildService | `packages/toolchain/src/api.ts`, `contracts/toolchain-api.md` | owner after the hand-off from WS1 |
| C10 CLI | `contracts/cli.md`, `packages/cli` | owner after the hand-off from WS1 |
| C5 IPC channel map | `packages/ipc-contract`, `contracts/ipc.md` | consumer |
| C8 Runtime log protocol + artifact | `contracts/log-protocol.md`, `contracts/runtime-artifact.md` | consumer; e2e log assertions |

C4 is frozen since CP-A: breaking changes need a T2 ADR co-signed by WS4, WS5 and WS6. Keep `MockBuildService` and `createFakeToolchain()` in sync with the real service.

## First tasks

1. **Leftovers.** Copy open items from WS1's status file (and WS3's in the standard fallback) into `docs/status/ws8.md`, then:
   - **BuildService wiring.** Wire WS5's `packAssets` and `checkRoomBudgets` (and `compileProject` if not yet wired) into `BuildService` before M2, through the `dsdude` CLI's composition root (C4): `dsdude play samples/minimal` runs PNG + `.dss` → ROM. WS4 and WS5 are cloud streams, so their functions arrive through `git merge main` once WS0 has integrated them.
   - **`dsdude doctor`** (IPC `doctor.run`, `--json`, exit codes 0/1/2): the exact fix for every missing prerequisite; 0xC0000135 (3221225781) reported as 'missing DLL'; a warning for long project paths (build paths stay under 250 chars); a warning when `OneDrive.exe` is running and the repo or project path is under `%OneDrive%` (risk 10).
   - **Tools pack.** `tools/fetch-vendor.ps1` builds `vendor/tools-pack/`, checked against the committed `tools/tools-pack.json`.
     - DLLs come from a recursive `C:\msys64\ucrt64\bin\objdump.exe -p` import walk (today `libstdc++-6.dll`, `libgcc_s_seh-1.dll`, `libwinpthread-1.dll`, `libiconv-2.dll`), copied only from `C:\msys64\opt\wonderful\bin`.
     - Each DLL must import `api-ms-win-crt-*`, not `msvcrt.dll`. Never `ldd.exe`.
     - Clean-PATH test (`PATH=C:\Windows\System32`, a path with spaces): `ndstool -V`, `grit -V` and `mmutil` exit 0; without the DLLs ndstool exits 0xC0000135.
   - **DeSmuME-profile polish.** Copy it from `C:\Users\zache\Downloads\desmume-0.9.13-win64\` to `<DSDUDE_HOME>\emulators\desmume-0.9.13\` (never `%TEMP%`); `desmume.ini` gets the melonDS key map; `dsdude play --emulator desmume` captures `DSD|LOG|hello`; 20 launches leave no orphan.
   - **Standard fallback only:** WS3's M4 stress check (a `tests/e2e/` test asserting `DSD|STAT` `fps=60` on melonDS with WS2's 300-instance stress fixture), and hardware notes in `docs/qa/`: DLDI/argv (Homebrew Menu or TWiLight Menu), scanline limits (spike 15), and `gdb-multiarch -ex "file runtime/dist/arm9-debug.elf" -ex "target remote localhost:3333"`.
2. **`npm run e2e`** (`tests/e2e/`, `samples/hello|minimal` first): a py-desmume 0.0.9 300-frame screenshot against a golden py-desmume generated; melonDS `DSD|` assertions (READY once, no duplicates); a host-vs-melonDS trace diff (`--seed N`); WS6's Playwright smoke test.
3. **CI.** `scripts/ci.ps1` runs check, tests, host goldens, conformance tiers and e2e. `origin` is a private GitHub repo (Day 0), so `.github/**` workflows are possible: BlocksDS docker image for the runtime, a Windows runner for the IDE. Actions minutes on a private repo cost money, so write that ADR first and commit nothing under `.github/workflows/` until the user decides it: WS0 pushes `main` after every integration and the cloud streams push branches that merge `main`, so a committed workflow with a `push` trigger can run on every push. `vendor/` never reaches GitHub, so workflows cannot use `vendor/tools-pack/`.
4. **Installer** (`apps/ide/electron-builder.yml`, `scripts/release.ps1`): NSIS x64, `compression: maximum`, `npmRebuild: false`; `extraResources` = tools pack (`resources/tools-pack/`), melonDS 1.1, `runtime/dist`, licenses, `templates/**`, `docs/tutorial/**`, `docs/manual/**`, `docs/reference/**`; `electronFuses` on release builds only; electron-updater via GitHub Releases. Public releases, the GitHub Releases provider and the unsigned installer are open question 6 (decided by M6); publishing a Release is the user's action.
5. **License bundle** (section 2.11) with the Corresponding Source (BlocksDS v1.24.0 ndstool and grit plus packaging scripts; melonDS 1.1) in the same GitHub Release.
6. **Release checks:** the M5 installer on a Windows profile without MSYS2, an offline clean-VM install, the hardware checklist, `CHANGELOG.md` and release notes, a `docs/qa/` report per checkpoint.

## Definition of done (section 6 WS8)

- `npm run e2e` is green on this machine with both emulators.
- The installer bundles the tools pack and melonDS 1.1, with the GPL-3 text and the 1.1 source archive in the same GitHub Release. The first-run wizard therefore only verifies them (SHA-256) and offers the optional DeSmuME profile. Downloads are used only for emulator updates.
- The installer installs on a clean Windows 11 VM/profile, offline install included, and the Flappy sample plays.
- The download page documents SmartScreen's 'More info → Run anyway' unless an Authenticode certificate is budgeted.
- The release notes and the license bundle required by section 2.11 are included (license texts, SHA-256s, Corresponding Source).
- The sample is verified on a real DS if a flashcart exists; otherwise the release notes say it is untested on hardware.

**Hand-off:** WS8 runs to release (M6) in every mode. It owns the toolchain ADRs after the hand-off from WS1.

## Testing in isolation and verifying without eyes

**Isolation:**
- IDE tests use the fake toolchain (`createFakeToolchain()`, `MockBuildService`).
- Emulator tests use BlocksDS-built fixture ROMs.
- Real-tool tests skip when `detectToolchain()` fails.

**Verifying without eyes:** You cannot see emulator or IDE windows. Verify with (1) `DSD|` log lines (READY/LOG/ERR/MEM/STAT/EXIT per contract C8) captured by `dsdude play` / EmulatorManager, which drops the `DSD|PAD|` flush-pad lines; lines arrive live because of the flush pad, or at graceful Stop (`taskkill /PID`, `/F` after 2 s); and (2) `dsdude screenshot <rom> --frames N [--keys file] --out dir`, which writes top and bottom PNGs via py-desmume 0.0.9 with SDL_VIDEODRIVER=dummy and SDL_AUDIODRIVER=dummy. Read the PNGs with the image-capable Read tool. A definition of done about what a screen shows means the `dsdude screenshot` PNG at frame N matches a golden PNG or passes a stated check. For runtime-core behaviour use `dsdude-host` JSONL traces and PNG frames (always with `--seed N`). Ask the user only when a screenshot is ambiguous. Put a timeout on every spawned process, and close the dev IDE and emulator after each test.

## Coordination

- **Status.** `docs/status/ws8.md` holds progress, leftovers, requests to WS0 and `ADR-pending` markers. It ends with `## Integration feedback`, where only WS0 appends `IF-` entries: fix open ones first and never edit that section. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading; WS0 re-runs the check and appends the resolved line.
- **Contract changes (section 7.4).** T0 (text) is committed with a CHANGELOG line. T1 (additive) gets a minor bump and a CHANGELOG entry. T2 (breaking) needs an ADR. Toolchain changes are your ADRs, applied at a checkpoint when no builds run.
- **Daily.** Run `git restore package-lock.json`, merge `main` into your branch, and never rebase once WS0 has merged any of your commits. WS0 integrates with `tools/checkpoint.ps1`. Your branch stays local; WS0 publishes `main` and the tags to `origin`, and you never push.
- **Cloud streams** (WS2, WS4, WS5, WS7, WS6b). WS0 fetches their pushes from `origin` and merges them; you get them through `main`, never from `origin/ws*` or `claude/*` refs. They test on Linux, so your Windows e2e catches separator, case, CRLF, spawning and emulator failures (risk 28). Put regressions (command, first error lines, owner) in your `docs/qa/` checkpoint report; WS0 relays those in cloud code as `IF-` entries. An ADR a cloud stream must act on (for example a C4 T2 ADR that WS4 and WS5 co-sign) reaches it only after WS0 merges your branch and pushes `main`, so commit it promptly. WS0 and you verify WS7's M4 template screenshots and M5 tutorial locally.
- **Checkpoints** (weekly from CP-C; in the standard fallback also at every slot hand-off). Commit, update your status file, and leave the branch alone until WS0 reports the merge. You attend every checkpoint (section 7.3).

## Machine limits and gotchas

- **Capacity.** Hybrid keeps the standard-mode limits locally: 4 local Claude Code instances (WS0 plus 3 slots), one Electron dev IDE and one emulator window machine-wide, and the memory gate (> 1.5 GB available). Cloud sessions use no local RAM. The upgraded fallback allows one emulator per worktree. Run emulator e2e tests serially, and check `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue` first.
- **Clean VM.** Windows 11 Home has no Hyper-V or Windows Sandbox. Settle the VM with the user early, and run it only when more than 1.5 GB is free.
- **py-desmume.** Installed in `python`'s user site at hour zero (CLAUDE.md, "Python"); spawn it with `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy`. The core is the SkyTemple fork (0.9.12). devkitPro libnds-2 ROMs hang white, so detect hangs from the screenshot, not `is_running()`. It needs the VC++ 2015-2022 x64 runtime.
- **Spawning.**
  - Emulators spawn without `windowsHide`. Console tools spawn with `windowsHide` and a timeout.
  - Wait for melonDS to exit before you rewrite `melonDS.toml`.
  - Run bash as `bash.exe -lc` with `CHERE_INVOKING=1`, using single-quoted inner strings.
  - Without the `C:\msys64\opt\wonderful\bin` PATH prefix, tools exit 0xC0000135.
  - Always pass `-7`.
- **Packaging.** Never run `pacman`/`wf-pacman`. DeSmuME is not bundled. Package `vendor/tools-pack/`, but never `vendor/mwccarm/` (it needs `LM_LICENSE_FILE`) or `vendor/dsd/`.
- **Line endings.** `*.ps1` files are CRLF and everything else is LF. Goldens are written in binary mode.

## References

- **PLAN.md:** 2.1, 2.6, 2.11, 3.4 (packaged content), 5 C4, C5, C8, C10, 6 WS1 and WS8, 7.2 (hybrid mode), 7.3, 8 M4, M5, M6, 9 risks 2, 8, 9, 10, 14, 21, 27, 28, 10 questions 4-6.
- **Research:** `docs/research/01-toolchain.md`, `docs/research/03-emulator.md`, `docs/research/06-idestack.md`, `docs/research/verification.md` claims 3, 6, 7, 10.
