# WS5 kickoff: Asset pipeline

You turn a project's sprites, backgrounds, sounds and icon into the NitroFS pack (`gfx/*.grf`, `bg/*.grf`, `soundbank.bin`) and `assets.manifest.json`. The conversion is deterministic and incremental, and every DS limit gets a friendly E4xx message. You own C3 (`contracts/assetpack.md`) and the preview API behind the IDE's import dialog. WS5 is a cloud stream: a Claude Code cloud session from CP-A, environment `dsdude-ws5`, stream line `ws5-assets`. Paths are repo-relative.

## Paste this to start

```text
You are workstream **WS5: Asset pipeline** on DSDude, a GameMaker-like Nintendo DS IDE, running as a Claude Code **cloud session** (Ubuntu VM, no Windows tools).

- **Start:** run `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS5`, then `bash tools/cloud/start.sh` (10-minute timeout). Report failures rather than working around them.
- **Read:** `docs/kickoff/ws5.md` (its "Cloud setup" block replaces the Windows setup, env block and machine facts), `docs/kickoff/README.md` section 8, your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md`, your contract files, and only the `PLAN.md` sections they cite.
- **Paths and pushing:** write only the paths `tools/ownership.json` gives WS5. Your stream line is `ws5-assets`; push only with `bash tools/cloud/push.sh`, after every green batch.
- **Never:** commit `package-lock.json`, run `npm ci`, edit root config or `vendor/`, or run Windows tools, emulators or Electron.
- **Tests and merges:** run `npm test -w packages/asset-pipeline` before each commit, with a timeout on every process. Merge `origin/main` daily, and never rebase once WS0 has merged your commits.
- **Blockers:** if a contract blocks you, write `docs/adr/NNNN-<title>.md`, mark the workaround `// ADR-pending ADR-NNNN`, and continue.
- **Status:** fix open `## Integration feedback` entries in `docs/status/ws5.md` first, and never edit that section. The VM is ephemeral, so your branch and `docs/status/ws5.md` are your only memory: keep the file current and continue from it.

Your contracts: packages/asset-pipeline/src/preview.ts, packages/toolchain/src/api.ts, contracts/diagnostics.md, contracts/runtime-limits.json, contracts/project-format.md. Operating mode: hybrid (cloud session) (the CLAUDE.md Status block is authoritative; if it records a fallback, follow the fallback notes in docs/kickoff/ws5.md). Then begin with task 1 under "First tasks" in docs/kickoff/ws5.md.
```

## When this stream starts

- **Hybrid mode (the plan):** a cloud session at CP-A (D+3); no local slot or RAM. If usage limits bite, WS6b is dropped first, then WS5 waits for a free cloud slot.
- **Fallbacks** (PLAN.md section 7.2; WS0 records a switch in the CLAUDE.md Status block and re-plans):
  - *Standard:* local, nominally slot 3 after WS4 hands off (after M1, ~week 5), until ~week 8. Continue with `git fetch origin; git worktree add -B ws5-assets ..\DSDude-ws5 origin/<push target>`, then README section 3 (`DSDUDE_PORT_BASE` 5150).
  - *Upgraded* (after a RAM upgrade): may move home the same way.

**What must exist first:**
- **`git tag phase0`** (WS0): `packages/toolchain/src/api.ts` (`ToolPaths`, `PackAssetsFn`, `MockBuildService`), the preview types, C1, C9, C13, `samples/minimal` and `samples/flappy` v0, and `fixtures/assets/` (16x16 3-frame sprite PNG, 256x192 background PNG, one WAV).
- **WS0's launch:** tag `start-ws5`, and `main`, the tags and `ws5-assets` pushed with the README section 8 repo pieces.
- Real grit/mmutil exist only locally (WS1's `toolchain-ok`); in the cloud your tool tests always skip.

**Milestone pressure.** M2 (hybrid week 4-5; standard fallback week 7-8) needs `packAssets` for `dsdude play samples/minimal`; CP-B (D+7) expects the flappy assets packed (WS0 confirms with the real tools). End-to-end path first, cache and budgets after.

## Cloud setup

Canonical procedure: `docs/kickoff/README.md` section 8. Environment `dsdude-ws5` (user, once; README section 8): network Custom (default package-manager list plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`); variables `DSDUDE_WS=WS5`, `DSDUDE_PORT_BASE=5150`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`; the shared setup script (Node v24.16.0 in `/opt/node24`, `gcc` and `make`, Playwright 1.63.0 Chromium).

**Launch (user):** when WS0 says "launch WS5 (cloud)", open claude.ai/code (or the mobile Code tab) with repository `<user>/dsdude`, branch `ws5-assets` (or `main` if not offered), environment `dsdude-ws5` and mode **Auto** (else Accept edits), or `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-ws5`. Paste the block above, rename the session `WS5 assets`, and give WS0 its URL and the branch it reports.

**First commands** (every new session and every resume):

```bash
git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS5
bash tools/cloud/start.sh     # 10-minute tool timeout
```

start.sh fetches `main`, the tags and your stream line, adopts `ws5-assets` without discarding work (on divergence it stops: note it in `docs/status/ws5.md` and tell the user), runs the lockfile guard and `npm install` (the postinstall skips Electron under `DSDUDE_SKIP_ELECTRON=1`), restores the lockfile and prints versions. WS5 has no browser tests, so no Chromium.

**Linux env** (set by the SessionStart hook and the environment; no MSYS2/Wonderful block). If a fresh Bash call shows a `node -v` other than v24, run this block and note it in the status file:

```bash
export PATH=/opt/node24/bin:$PATH
export DSDUDE_HOME=$HOME/.dsdude     # <build> = $DSDUDE_HOME/build/<project-hash>
export DSDUDE_SKIP_ELECTRON=1 DSDUDE_MAKE_JOBS=4
export DSDUDE_PORT_BASE=5150         # unused by WS5 (no browser tests)
```

**Pushing.** `bash tools/cloud/push.sh` after every green batch; never end a turn with unpushed work (idle VMs are reclaimed). It refuses commits that touch `package-lock.json` or lack the `DSDude-WS: WS5` trailer, then tries the recorded target, `ws5-assets`, `claude/ws5-assets` and the session's own branch. On "NEW push target", put ``Cloud push target: `<t>` `` under the title of `docs/status/ws5.md`, commit, run push.sh again and tell the user. Never push `main` or tags, force-push or open PRs.

**npm and the lockfile.** `npm install`, never `npm ci`, then `git restore package-lock.json`. A new dependency is `npm install <pkg>@<exact> -w packages/asset-pipeline`; commit only that `package.json`. If the guard fails, leave the lockfile alone, write `BLOCKER lockfile` in the status file, push and tell the user; meanwhile `npm install --no-save <missing>@<version>` (e.g. `@tailwindcss/oxide-linux-x64-gnu@4.3.3`), never `--force`.

**Resume.** Reopen the same session and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/ws5.md." A reclaimed VM keeps the conversation but loses processes and unpushed files. Replace an archived or unusable session with a new one (same environment, the paste block plus "continue from docs/status/ws5.md") and give WS0 its URL. `/compact` works; `/clear` does not.

**Windows-only checks** (real grit/mmutil, `npx dsdude assets samples/flappy`, GRF/soundbank identity, the XM fixture through mmutil, `dsdude screenshot`): WS0 verifies this locally at integration; watch the integration-feedback list in `docs/status/ws5.md`. WS3 runs both sides of spike 11.

## Owned paths and contracts

**Owned:** `packages/asset-pipeline/**` (including `src/diagnostics/catalog.ts` and `src/preview.ts`), `fixtures/assets/**` except `fixtures/assets/golden/**` (a WS0 row: WS0 generates the py-desmume golden locally), `contracts/assetpack.md`, `docs/manual/assets/**`, `docs/status/ws5.md` (except its `## Integration feedback` section, which WS0 appends).

**Not yours:** `packages/toolchain/**` and `packages/cli/**` (WS1, then WS8); `samples/**` (`samples/hello` WS1 then WS8; `samples/minimal` and `samples/flappy` WS4 until M2, then WS7; the rest WS7; report limit problems to their owner); root config; `package-lock.json` (commit only your `package.json`).

**Enforcement:** `.githooks/pre-commit` runs `tools/check-ownership.ts` (reads `dsdude.ws`; uses `origin/main` in the cloud); `.githooks/commit-msg` adds the `DSDude-WS: WS5` trailer; WS0 re-checks every commit in `main..origin/<push target>` and refuses violations.

| Contract | Files | Role |
|---|---|---|
| C3 Asset pack layout + manifest | `contracts/assetpack.md` | owner (write it on day 1) |
| C12 asset preview API | `packages/asset-pipeline/src/preview.ts` | owner; frozen at CP-B (hybrid and upgraded) or by the late-start rule (standard fallback) |
| C4 | `packAssets` matching `PackAssetsFn` and `checkRoomBudgets` matching `CheckRoomBudgetsFn` in `packages/toolchain/src/api.ts`, plus `cliCommands` | implementer |
| C9 Diagnostics | `contracts/diagnostics.md` | consumer; owns E4xx except E49x, `packages/asset-pipeline/src/diagnostics/catalog.ts` |
| C1, C13 | `packages/project-format`, `contracts/project-format.md`, `contracts/runtime-limits.json` | consumer |
| C14 | the XM fixture | producer |

## First tasks

1. **Day 1: `contracts/assetpack.md`**, from sections 2.9 and 5 C3, with a version header, a "how to change me" section and a CHANGELOG entry.
   - Cover NitroFS layout, grit lines, frame stride, OBJ-size padding, limits, naming rules, soundbank order and ids, the icon, the manifest schema and per-room asset sets.
   - After day 1, changes are T1, or T2 ADRs co-signed by WS2, WS3, WS4 and WS6.
   - **Spike 11:** WS3 runs both sides locally. **Standard fallback, same day:** the mmutil side: a `smpl`-looped WAV plus an XM through mmutil; record in `docs/status/ws5.md` that `mmutil -V` reports v1.24.0.
2. **PNG → RGB555 quantizer → strip/stitch, with golden byte tests.**
   - Transparency (alpha, magenta or the top-left pixel) goes to index 0.
   - Reduce a 32x32x32 histogram (Wu/median-cut) to 255 or 15 colours, with optional Floyd-Steinberg/Bayer dithering and automatic 16/256 mode.
   - Restitch the strip vertically, pad frames to the next OBJ size, and apply the `sprite.json` defaults. `image-q` is a test cross-check only.
3. **`ToolPaths` wrappers for grit and mmutil**, with skip-if-missing tests (see Gotchas; they skip in the cloud). Also: sound decode/resample, tracker pass-through, MP3-as-music E4xx, and the XM fixture in `fixtures/assets/` with its origin noted (generated, or CC0).
4. **`packAssets()`** matching `PackAssetsFn`, and `dsdude assets samples/flappy --json` through `cliCommands`.
   - It writes `<build>/nitrofs`, `<build>/icon.png` and `<build>/assets.manifest.json`, where `<build>` is `<DSDUDE_HOME>\build\<project-hash>`.
   - C10 exit codes: 0, 1 = diagnostics, 2 = tool failure.
   - The `packages/toolchain` owner (WS1, later WS8, or WS0 in between) wires it into `BuildService`, injected by the `dsdude` CLI and the IDE build worker (C4); say in your status file when it is ready.
5. **Preview API:** `previewSprite(png, opts) → {palette, indices, colorCount, frames}`, plus the original vs converted pixels.
   - Keep it pure: byte arrays, no `fs`.
   - Hybrid freezes it at CP-B (D+7); the standard fallback freezes it at the first checkpoint at least three working days after your start (section 7.3).
6. **Then: the cache, per-room budgets, the E4xx catalog and `docs/manual/assets/`.**
   - Cache in `build/cache/<sha256>/`, with the tool version in the key.
   - Budgets: implement `checkRoomBudgets` (C4), over the room asset sets that `compileProject` returns: padded OBJ VRAM, 16/256-colour OBJ palette pools, BG palette slots, sound RAM. `BuildService` calls it after `compileProject`.
   - The "more than 24 user slots" limit is E49x, in the compiler catalog (section 5 C9), not yours.

## Definition of done (section 6 WS5, verbatim)

- Golden tests: fixture PNG/WAV -> byte-identical GRF/soundbank across runs. Unit tests mock grit; integration tests use the real grit and skip if it is absent.
- A second run on the sample project takes < 50 ms.
- Every limit violation names the asset, the limit and a fix. Examples: "spr_boss is 100x100. DS sprites can be at most 64x64. Shrink it, or make it a Background." and "rm_game needs 18 colour sets on the top screen, but the DS has 16. Reduce spr_a or spr_b to 16 colours."
- Colour reduction is always a warning with preview data, never a failure.
- The sample assets display correctly: a `dsdude screenshot` of a ROM built from them matches its golden PNG in `fixtures/assets/golden/` (checked with WS3's ROM). The cloud cannot run py-desmume or the real grit/mmutil, so WS0 generates that golden locally and owns the folder (section 3.4).

WS0 checks the real-grit tests and the screenshot bullet locally; you are done when they pass there and no `IF-` entry is open.

**Hand-off.** Hybrid: runs to its definition of done; later fixes run as short cloud sessions. Standard fallback: hands slot 3 to WS6 (~week 8) when `dsdude assets` meets its definition of done; later fixes run as short WS5 sessions.

## Testing in isolation and verifying without eyes

**Isolation (verbatim):** The quantizer and tiler are pure TS with golden bytes; tool wrappers skip when ToolPaths is empty.

Until the compiler emits ROOMS, budget tests use hand-written room-set fixtures.

**Without eyes:**
1. In the cloud: golden bytes, the preview API's palette and indices, and the converted pixels written to a PNG and read with the image-capable Read tool.
2. ROM screenshots against the py-desmume golden in `fixtures/assets/golden/` (WS0's row, made locally), `DSD|MEM` at room start (`objvram_top`, `pal16_top`, `snd`, ...) against your manifest, and `DSD|ERR` R5xx load failures: WS0 verifies this locally at integration after M2; watch the integration-feedback list in `docs/status/ws5.md`.

## Coordination

- Keep `docs/status/ws5.md` current: progress, your `Cloud push target:` line, start.sh's version line, spike 11 (standard fallback), leftovers, open `ADR-pending` markers.
- **Tiers (section 7.4):** T0 doc text + CHANGELOG line; T1 additive, with minor bump, CHANGELOG and fixtures in one commit (WS0 reviews within 24 h); T2 breaking, by co-signed ADR.
- **Daily:** `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`; never rebase once WS0 has merged your commits. After each fetch, read `docs/status/checkpoint-N.md` and your `## Integration feedback` section on `origin/main` (`git show origin/main:<path>`), and fix open `IF-` entries first. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading and push; WS0 re-runs the check and appends the resolved line.
- **At a checkpoint** (CP-A/CP-B/CP-C, then weekly; standard fallback: also every slot hand-off): commit, update status, push with push.sh, and stop touching the branch until the user relays "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..." (README section 5), and do what the relay says: the VM may have been reclaimed while you waited.

## Machine limits and gotchas

- **Capacity:** the cloud VM has no BlocksDS, emulator, py-desmume or Electron; never install system packages (setup-script changes are WS0 ADRs). No watch mode and no background processes left running.
- **Spawning** (the wrappers run on Windows; WS0 verifies them at integration): spawn `grit.exe`/`mmutil.exe` directly (no bash) with `windowsHide: true` and a timeout.
  - In development, prefix PATH (key `Path`/`PATH`) with `C:\msys64\opt\wonderful\bin`, or grit exits 0xC0000135 silently. Paths under 250 chars; delete partial outputs.
- **Sprites:** `grit sheet.png -gB8 -gt -gTFF00FF -m! -ftr -fh! -W1 -o <out>` on an indexed PNG with magenta at index 0 (4bpp: `-gB4 -pn16`).
  - `-fh!` keeps a stray `.h` out of `build/nitrofs`.
  - The VRAM stride is `roundUp(frameBytes, 128)`, and the manifest counts padded bytes.
  - pngjs cannot write palette PNGs, so write IHDR/PLTE/IDAT/IEND yourself with `node:zlib`.
- **Backgrounds:** `grit bg.png -gB8 -gt -m -mLs -mRtf -gTFF00FF -ftr -fh! -W1 -o <out>`. Never use `-mRtpf` on 8bpp.
- **mmutil:** `mmutil <WAVs sorted by name> <modules sorted by name> -d -o<abs build>/nitrofs/soundbank.bin -h<abs build>/soundbank.h`.
  - Option values are attached (a space makes the path an input); cwd is a writable build dir.
  - Delete both outputs first, and treat a missing output as failure: mmutil exits 0 when it cannot open the header.
- **Sound ids:** read them from `soundbank.h` (CRLF). SFX ids share one counter with module samples.
- **Names:** sound stems are ASCII, contain no '.' and are <= 63 chars. NitroFS names are ASCII 0x20-0x7E and <= 127 chars.
- **WAV output:** only `fmt`, `smpl` (loop >= 16 samples) and `data` chunks, mono 16-bit <= 22050 Hz.
- **Decoders:** `@audio/decode-wav` 1.5.0 / `@audio/decode-mp3` 1.3.1, never the GPL `@audio/decode` umbrella.
- **Tools:** grit and mmutil come from the same BlocksDS release as libnds (risk 21).
- **Determinism:** goldens as Buffers, no `Math.random`, no native addons.
- **Messages:** follow `contracts/diagnostics.md`. VRAM, OAM and palette slot are banned words; say "colour sets". Colour reduction is a `warning` in your E4xx range; if it needs a W code, ask WS0 by ADR.

## References

- `PLAN.md`: 2.9, 3.2 (steps 4-5), 5 C1, C3, C4, C9, C12, C13, 6 WS5, 7.1 spike 11, 7.3, 9 risks 6, 21, 23, 26, 28. Also: 2.5, 3.4, 7.2, 7.4, 7.5, 8 M2.
- `docs/kickoff/README.md` section 8 (cloud sessions), `docs/status/cloud.md` (registry).
- `docs/research/01-toolchain.md`, `docs/research/05-hardware.md`, `docs/research/verification.md` claims 5, 9.
