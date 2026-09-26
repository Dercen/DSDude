# DSDude — Build Plan (v1.2, 2026-09-25, verified, Day-0 decisions applied)

*A GameMaker-Studio-style IDE for Nintendo DS games with its own GML-flavoured scripting language (DSS), built by concurrent Claude Code instances in hybrid mode: a persistent local integrator (WS0) and up to three local stream instances for the work that needs Windows tools, plus Claude Code cloud sessions for the headless streams (sections 2.10 and 7.2). This file is `PLAN.md` at the root of the repo, `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`, the folder it was written in. Day 0 makes that folder a git repo in place and pushes it to a private GitHub `origin` (section 7.1). Every instance reads its `docs/kickoff/wsN.md`, its package `CLAUDE.md`, `contracts/README.md` and the `PLAN.md` sections they cite before writing code. Where this plan and a file under `contracts/` disagree, the contract file wins and this plan gets an ADR.*

**What changed with the Day-0 decisions (v1.1 → v1.2, 2026-09-25).** The user answered the location, operating-mode and naming questions. No architectural decision changed.
- **Location:** the repo stays in this folder, where OneDrive sync is not active. Day 0 runs `git init -b main` in place, commits a minimal `.gitignore` first, moves the vendor binaries into `vendor/` and commits the documents. Local worktrees are siblings, `..\DSDude-ws<n>` (2.10, 3.4, 7.1, risk 10).
- **Operating mode: hybrid.** WS0, WS1, WS3, WS6 and WS8 run locally within the standard-mode limits. WS2, WS4, WS5, WS7 and the optional WS6b run as Claude Code cloud sessions. Standard and upgraded modes remain only as fallbacks. Release 0.1 is planned for around week 12-14 (2.10, 7.2, 7.3, 8).
- **GitHub:** a private `origin`, created by the user on Day 0, with the Claude GitHub App installed on it. `vendor/` never leaves this machine (2.2, 2.10, 3.4).
- **Cloud procedure:** one environment `dsdude-wsN` per cloud stream, `tools/cloud/start.sh` and `push.sh`, the `docs/status/cloud.md` registry, a Day-1 cloud probe, `IF-` integration-feedback entries, a Linux gcc build of the runtime core, and a lockfile guard for Linux native binaries (2.4, 2.5, 2.10, 7.1, 7.2, 7.5).
- **Names confirmed:** DSDude (product), DSS / `.dss` (language), DSDB (bytecode).
- **Open questions** shrink to six (section 10). New risks 22-28 cover the cloud side (section 9).

**What changed after verification (v1.0 → v1.1).** Two verifiers checked each of 13 load-bearing claims, and three critics reviewed the whole plan. `docs/research/verification.md` is the audit trail. No architectural decision was reversed. The biggest changes:
- **Toolchain install:** the Wonderful bootstrap comes from the tarball, not the Inno `.exe`, which raises a UAC prompt and runs `pacman -Sy make` on the user's MSYS2. The `wf-tools` step loops, because the first run only upgrades wf-pacman. Every `bash -lc` spawn sets `CHERE_INVOKING=1` (2.1, 6 WS1, 7.1).
- **Log capture:** the runtime picks one print protocol from the emulator ID at `0x04FFFA00`, because printing through both duplicates lines on melonDS. Key lines are followed by a >= 5 KB flush pad, because both emulators block-buffer stdout on a pipe (2.6, 3.2, 5 C8). Emulators are spawned without `windowsHide` (2.6, 3.2, 5 C4).
- **Memory, VRAM and CPU numbers:**
  - The VRAM bank table is now symmetric, and OBJ frames are 128-byte aligned.
  - Instance blocks grow to 384 bytes, and a 512 KB room arena plus a sound-RAM budget replace the 1.5 MB arena.
  - VM cost is re-priced at ~24-36 cycles per op, and the M1 gate is defined (2.3, 2.9, 3.3, 5 C13, 8).
- **Front-end pins:** dockview-react, the Monaco 0.56+ entry points, composite `tsc -b`, MIT-only audio decoders and an `install-electron` postinstall (2.5).
- **Language rules for beginners:**
  - Number edge cases and number formatting.
  - Same-screen collisions and touch semantics.
  - Event inheritance and `with`.
  - A UI text layer and per-room asset sets.
  - Plain-language diagnostics.

  See 2.8, 3.3, 4, 5 C6 and 5 C9.
- **Ownership and governance:** one `tools/ownership.json`, enforced at WS0's integration. A persistent Claude WS0. A 2-day minimum-viable Phase 0. Tiered contract changes with a 24-hour turnaround. `.gitattributes` (2.10, 3.4, 7).
- **Concurrency modes:** standard mode is WS0 + 3 streams on today's 11.3 GB usable RAM, with release 0.1 around week 16-20. Upgraded mode is WS0 + up to 7 streams with 32 GB, with release 0.1 around week 12. Both modes add a memory gate and can use cloud sessions for headless streams (2.10, 7.2, 8). (Superseded in v1.2: cloud sessions belong to hybrid mode; standard and upgraded mode are fallbacks, and standard is all-local.)

## 1. Vision and scope

A beginner opens DSDude, clicks **New Project**, drops `bird.png` onto **Sprites**, creates `obj_bird`, types ten lines into its **Step** event, drags it onto the top screen of `rm_game`, and presses **Play**. Two to three seconds later melonDS opens with the bird flapping. When they mistype `draw_sprit`, the Problems panel says *"I don't know a function called `draw_sprit`. Did you mean `draw_sprite`?"* followed by the code `E201` as a link. Clicking the entry lands on the line. Nothing about MSYS2, GCC, VRAM banks, OAM slots, palettes or ROM headers ever leaks into that loop. DS limits appear as meters in the status bar (hardware terms only in tooltips), never as link errors.

Two principles from the winning plan and the judges' verdicts organise everything below:
- **The pipeline is the product.** The path from "scripts + PNGs" to "a `.nds` booting in the emulator" must work from the command line before the IDE wraps it, and it is the first thing built.
- **The beginner journey is the acceptance test.** The table below is the M5 script that a real beginner walks through with no help.

| Step | What the beginner sees | What runs underneath |
|---|---|---|
| 1 New Project | A wizard asks for:<br>- a name;<br>- a folder (default `%USERPROFILE%\DSDudeProjects`, with a warning if the path is under `%OneDrive%`);<br>- a template: Empty, Flappy Bird (the finished sample, playable on the first Play), Top-down, Touch paint or Platformer starter.<br><br>Tree: Sprites, Backgrounds, Sounds, Objects, Rooms, Scripts, Game Settings. | `@dsdude/project-format` writes `project.json` and the folders. The template is copied from `templates/`, listed from one registry, `templates/index.json`, owned by WS7. Build output goes to `%LOCALAPPDATA%\DSDude\build\<project-hash>\`, never into the project folder. |
| 2 Import a PNG | Drop `bird.png` on Sprites. The dialog shows:<br>- 16x16, 3 frames detected, 9 colours;<br>- mode "16 colours", chosen automatically;<br>- transparency source and an origin picker;<br>- the original and the DS preview side by side. | `@dsdude/asset-pipeline` decodes (pngjs), snaps to RGB555, quantizes and reports colour counts. Nothing is written until OK. |
| 3 Make an object | New Object `obj_bird` has: Sprite, Screen (Top/Bottom), Depth, Visible, Parent, and an **Events** list with "+ Add Event". | `objects/obj_bird/object.json` plus one `.dss` file per event. |
| 4 Write ten lines | Monaco with DSS colours, completion, hover docs, signature help and live squiggles. F1 on a builtin opens its reference entry in the Learn panel. | `@dsdude/language-service` in a Web Worker over `@dsdude/lang`. |
| 5 Place it in a room | The room editor shows both DS screens stacked, with a background per screen. Drag `obj_bird` onto the top screen. Status bar: `Top: 1/128 sprites · 1/16 colour sets · Bottom: 0/128 sprites · Game memory 1.2/3.3 MB`. | `rooms/rm_game/room.json`. Meters come from `assets.manifest.json` and `contracts/runtime-limits.json`. These count 16-colour OBJ palettes, 256-colour OBJ palettes, BG palette slots and padded OBJ VRAM separately per screen, and the tooltips name them. |
| 6 Press Play | Output streams `compile 41 ms · assets 8 ms (cached) · rom 190 ms · launching melonDS...` then `DSD|READY`. The first Play of a session shows the Controls card (for example X = A, Z = B, Enter = Start; click the bottom screen to touch). | Compile to `game.dsdb`, convert changed assets, `ndstool -c`, relaunch the emulator (section 3.2). |
| 7 Make a typo | A squiggle appears while typing. On Play, Problems shows the E2xx message with object/event/line, and clicking it jumps there. Runtime errors also draw a red box on the DS bottom screen (START restarts the room). | Diagnostics catalog (5 C9) and the `DSD|ERR` log protocol (5 C8). |
| 8 Share | Game Settings: title, icon, author. **Export .nds** saves a copy of `game.nds` from the build directory. | The same ROM. It runs on flashcarts via Homebrew Menu / TWiLight Menu. |

**In scope for 0.1:**
- Sprites (PNG import, pixel editor) and one background PNG per screen per room.
- Sound effects from WAV or MP3 and tracker music (.xm/.mod/.it/.s3m), with a built-in CC0 library.
- Objects with the fixed event set.
- Rooms with two screens and a view per screen.
- The ~90-function DSS API.
- Play/Stop in melonDS, with DeSmuME as a second profile.
- Diagnostics and meters.
- Five New Project templates listed in `templates/index.json`. Three of them are the samples `samples/flappy`, `samples/topdown-mini` and `samples/touch-paint`.
- The generated reference, and a Flappy Bird tutorial in the in-app Learn panel.
- An NSIS installer that bundles the tools pack and melonDS, a first-run wizard that verifies them, and auto-update.

**Explicit non-goals for 0.1** (documented in the manual's "Differences from GameMaker" chapter):
- **Editing features:** drag-and-drop actions; tile painting and tilesets (one PNG per screen only).
- **Language features:** structs/methods/`new`, try/catch, enums, `ds_*` data structures, doubles and int64, bitwise operators, `??`, `^^`, `#macro`.
- **Engine features:**
  - Physics, paths/timelines/sequences, the layers API.
  - Surfaces/shaders/particles and `image_alpha`/`image_blend`.
  - Precise pixel collision, `solid` and `persistent`.
  - Custom fonts and 3D.
- **Input and I/O:**
  - Keyboard/mouse/gamepad APIs: buttons and touch replace them. `keyboard_check*` with the arrow, space and enter `vk_*` keys is accepted as a D-pad/A/Start alias, with a hint.
  - Text input, files/saves and networking.
- **Tools:** a GDB debugger UI, native-C export, an in-window emulator and the dsd ROM inspector.

Each of these is either v1.1 or v2, and none of them is needed for Flappy or a top-down game. A block platformer in 0.1 uses invisible `obj_wall` instances (`visible = false`, which costs no OAM slot), placed with the room editor's grid-snap paint mode over the background PNG. Painted 8x8 collision tiles over backgrounds are the first v1.1 item.

## 2. Key decisions

### 2.1 Toolchain: BlocksDS 1.24.0 via the Wonderful Toolchain into the existing `C:\msys64`

**Decision.** Install BlocksDS 1.24.0 (2026-09-21; GCC 16.2.0, binutils 2.47, picolibc 1.8.12, libnds, maxmod, ndstool, grit, mmutil). Extract the Wonderful bootstrap tarball (`wf-bootstrap-windows-x86_64.tar.gz`) into `C:\msys64\opt\wonderful`, then run `wf-pacman`. The exact verified sequence is in section 6 WS1 and section 7.1. The Inno `.exe` with `/CURRENTUSER` is plan B.

Two details are load-bearing (`docs/research/verification.md` claims 1 and 2):
- The first `wf-pacman -Syu --noconfirm wf-tools` only upgrades wf-pacman itself and exits 0. The step therefore repeats until `/opt/wonderful/bin/wf-config` exists.
- Every `C:\msys64\usr\bin\bash.exe -lc` spawn sets `CHERE_INVOKING=1`. Without it, a login shell started with `SHLVL` unset (as from Electron or PowerShell) runs `cd $HOME`.

The install runs once, when WS1 starts, with the user present (~30 min, no UAC prompt, MSYS2 packages untouched). The user consents by launching WS1 and approving its prompts (open question 1). BlocksDS's compiler is used **only to build the runtime ELF**, by us, in CI and on developer machines. At Play time only its ndstool, grit and mmutil run. These reach end users in the tools pack (section 6 WS1/WS8), so end users never install a toolchain.

**Rationale.**
- BlocksDS is the actively maintained open DS SDK, with monthly releases.
- Everything that lands in a user's ROM is permissively licensed: libnds Zlib, maxmod ISC, crts MPL-2.0, ARM7 core Zlib.
- It ships exactly the primitives this architecture needs:
  - `ndstool` with ELF inputs and multiple `-d` NitroFS folders;
  - `grfLoadPath()`;
  - `mmInitDefault("nitro:/soundbank.bin")`;
  - a prebuilt `arm7_maxmod.elf`.
- Its Windows path is MSYS2 UCRT64, which the user already runs for SNES homebrew.

devkitPro works technically, but its wiki asks users not to redistribute its binaries, and its trademark policy forbids repackaging. That rules it out for a bundled IDE.

**Fallbacks:**
1. **Plan B: the Inno installer, only with the user's OK.** If the tarball route fails on this MSYS2, run `wf-bootstrap-windows-x86_64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /DIR=C:\msys64 /LOG=<file>` and accept its `pacman -Sy make` step, which touches the user's MSYS2.
2. **Plan C: devkitPro's pacman, only via ADR** (install only, never redistributed):
   - `pacman-key --recv BC26F752D25B92CE272E0F44F7FD5492264BB9D0 --keyserver keyserver.ubuntu.com`
   - `pacman -U https://pkg.devkitpro.org/devkitpro-keyring.pkg.tar.zst`
   - the `[dkp-libs]`/`[dkp-windows]` repos
   - `pacman -S nds-dev`

   This route costs more than a Makefile variant (`include $(DEVKITARM)/ds_rules`, calico ARM7). It also loses BlocksDS's `grfLoadPath`/HDRX GRF format, because devkitPro grit writes the older `HDR ` header, so WS3's loaders and WS5's GRF step change too. It needs an ADR; it is never a silent switch.

The four stray binutils in `C:\devkitPro\devkitARM\bin` are ignored.

**Rejected:**
- Building a HAL for CodeWarrior (section 2.2).
- ArchitectDS/CMake instead of the default BlocksDS Makefile. They are fine tools, but the default `rom_arm9` Makefile is CC0 and already does what we need.

### 2.2 What mwccarm and dsd do: nothing in the pipeline

`mwccarm` (Metrowerks 3.0 build 123) compiles bare-metal ARM946E-S C (verified, `docs/research/verification.md` claim 12), and that is all it does:
- no target headers;
- no libc (`stub_libs/libcf.a` is an 8-byte stub);
- no crt0/MPU/TCM setup, no IRQ dispatcher and no ARM7 program;
- 32-bit only;
- FlexLM-licensed: it hangs silently without `LM_LICENSE_FILE` and cannot be redistributed;
- cannot compile libnds's GCC-specific headers.

A from-scratch HAL is estimated at 8-14 person-weeks (`docs/research/02-mwccarm.md` section 7; this is an estimate, not a measurement). Linking BlocksDS's libnds is not a shortcut either: mwldarm cannot link the GCC-built `libnds9.a` (`docs/research/verification.md` claim 12). **It is not a backend.** Its only legitimate use is offline code-size inspection by whoever is curious. The NitroSDK `.lcf.template` files carry Nintendo's proprietary notice and never enter git.

`dsd` (ds-decomp 0.11.0) re-links *decompiled retail games*. Its `rom extract/build/config` commands require:
- a 0x4000 header;
- an FNT;
- a known banner version;
- a `nitrocode 0xDEC00621` ARM9 footer.

Homebrew ROMs fail these checks (`docs/research/verification.md` claim 12). **It is not in the pipeline.** A fenced-off v2 "Inspect retail ROM" panel is the only conceivable role.

On Day 0 both binaries move into `vendor/` inside the repo folder (section 7.1). `vendor/` is gitignored except `vendor/README.md`, which says so, and it never reaches GitHub: the `.gitignore` is in the first commit, and `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`) or any `mwccarm/`, `license.dat` or `dsd-*.exe` path, anywhere in the pushed history.

### 2.3 Execution strategy: bytecode VM inside a prebuilt runtime ELF

**Decision.** The runtime is a C program on libnds containing a bytecode VM and the GameMaker-style engine. It is compiled once to `runtime/dist/arm9.elf`. Every Play:
1. compiles DSS to a **DSDB** bundle (TypeScript, ~50 ms);
2. converts changed assets;
3. packs `arm9.elf + arm7_maxmod.elf + build/nitrofs/` with ndstool (~100 ms; 36-83 ms measured for small ROMs, `docs/research/verification.md` claim 3).

End users never install a compiler, and Play takes under a second before the emulator starts. Runtime faults carry object/event/file/line instead of an ARM exception.

**Rationale.** The ARM946E-S at 67 MHz has 1,120,380 cycles per frame.
- **Earlier estimates:** a switch-dispatch VM over untyped registers was hand-priced at ~27 cycles per simple op, and computed-goto dispatch at ~19. Both figures come from an mwccarm disassembly and the ARM9E-S cycle table, not from a measurement. Neither includes the tagged-cell type check (~4-6 cycles) or the watchdog decrement (~2).
- **Re-priced handler:** GCC 14/15 compiles a tag-checked 3-address handler on 8-byte cells to 22-24 instructions. That prices at:
  - ~24-30 cycles with code in ITCM and data in TCM or cache (the sources disagree by ~1 cycle per shifted-offset load; `docs/research/verification.md` claim 4).
  - ~36 cycles when straight-line bytecode streams from main RAM (a 46-cycle line fill per 8 words).
  - ~18-21 cycles for int-specialised handlers.
- **Result:** ~31-47K typed simple ops per full 1,120,380-cycle frame, and ~16-24K in a 50% script budget. That is roughly 200-500 instances with 30-80-op Step events. The hardware caps visible sprites at 128 per screen anyway.

Collision, movement integration, OAM building, animation, alarms, audio and loading are native C.

**These numbers are estimates until the M1 microbenchmark runs** (`docs/research/verification.md` claim 4). The hard gate (section 8, M1) requires >= 35,000 typed simple ops per full frame (<= 32 cycles/op):
- The op mix is fixed in `fixtures/bytecode/bench.dsda`.
- The bytecode runs as a >= 4 KB straight-line block in main RAM.
- Timing uses cascaded hardware timers on melonDS with JIT off.
- melonDS models no load-use interlocks, no D-cache and no shifted-offset penalty. Its figure must therefore reach >= 44,000 unless one hardware run calibrates the derating.

Below the gate, WS2 first adds the int-specialised opcodes reserved in C2, before the engine grows.

**Rejected:**
- **Transpile-to-C on every Play.** Every user would need a 300 MB toolchain, faults would be ARM exceptions, and there would be no script-level errors.
- **A general-purpose interpreter.** Lua/Python on DS have no performance numbers and a history of crashes.

Native export stays a post-v1 backend behind the versioned bytecode and ABI hash.

### 2.4 Runtime structure: portable core + DS platform layer, host build as the oracle

**Decision.** The runtime is split from day one into two parts:
- `runtime/core/` (C11, no libnds includes), owned by WS2;
- `runtime/platform/ds/` (libnds/maxmod), owned by WS3.

They are joined only by `runtime/core/include/dsd_platform.h` (contract C11).

The core also builds on the host with `C:\msys64\ucrt64\bin\gcc.exe` (15.2) into `dsdude-host.exe`, a headless trace runner:

```
dsdude-host <nitrofs-dir> --frames N --input keys.txt --trace out.jsonl [--png-dir dir] [--seed N]
```

`runtime/Makefile.host` must also build with Linux gcc (GCC 13 in the cloud image), with identical flags `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char`, because WS2 runs as a cloud session in hybrid mode (section 2.10). There the binary is `runtime/build-host/dsdude-host`, without `.exe`. A green Linux build alone is never done: WS0 runs the same goldens with MSYS2 gcc at every integration (risk 25).

Determinism between host and DS holds by construction under these rules:
- **Compilation.** Pure integer C11 with no floats, compiled on both targets with `-std=c11 -fwrapv -fno-strict-aliasing -funsigned-char`. Plain `char` is signed on x86-64 MinGW and unsigned on ARM. `size_t` and pointers are 8 bytes on the host but 4 on the DS. `long` is 4 bytes on Windows but 8 on Linux, so the core uses fixed-width integers only.
- **Cells and structs.** Cells hold 32-bit handles (pool indices, arena offsets), never pointers. Struct layouts are checked with `static_assert`.
- **Division.** Every division goes through core functions that first test `den == 0` and `INT_MIN / -1`. They then model the divider's DIV_64_32 mode: the quotient is truncated toward zero and the low 32 bits are returned.
- **Square root.** `sqrtf32` is modelled as floor(isqrt((u64)a << 12)) on an unsigned argument.
- **Trig tables.** BlocksDS libnds `source/arm9/trig.c` (SIN_LUT/TAN_LUT, SPDX Zlib) is vendored, with a small `math.h` shim supplying `inttof32` and the modelled `divf32`.
- **No libc ordering or formatting.** The core has its own xorshift32 PRNG, stable sort, creation-order iteration and number formatting. It uses no libc `qsort`, `rand` or `%f`.
- **UBSan.**
  - It runs in **trap mode** on the host (`-fsanitize=undefined -fsanitize-trap=all`). MSYS2 UCRT64 gcc has no `libubsan`, so the runtime-library mode does not link (`docs/research/verification.md` claim 11).
  - Under `-fwrapv`, GCC does not instrument `+ - *` overflow. The debug overflow trap in `value.h` therefore uses `__builtin_{add,sub,mul}_overflow`.
  - Trap exits show as Windows status 0xC000001D, and as SIGILL on Linux.
- **Host PATH.** On Windows, every host gcc spawn must have `C:\msys64\ucrt64\bin` on PATH. Without it, cc1.exe cannot load libmpfr-6.dll, and gcc exits 1 with no message.

Golden traces run on the host every commit (Linux gcc in WS2's cloud session, MSYS2 gcc in WS0's integration) and on melonDS at every checkpoint.

**Rationale.**
- The runtime is the 4-6 week critical path, and the platform seam is the only way two instances can work on it without stepping on each other.
- WS3 can bring up hardware with a selftest ROM before a single bytecode instruction runs.
- The same C code is the compiler's execution oracle, so the oracle cannot drift from the product.

**Rejected:**
- A TypeScript reference VM. A third implementation of the semantics is a drift source; compiler goldens are disassembly snapshots plus host traces instead.
- Testing the C runtime only through emulator runs.

### 2.5 IDE stack

**Decision.** One TypeScript codebase covers the IDE, compiler, asset pipeline and language service, so concurrent agents share types and fixtures. The exact pins use npm 11.13 workspaces (`docs/research/verification.md` claim 8):

| Area | Pins |
|---|---|
| Shell and build | Electron 44.4.5, Vite 7.3.6, electron-vite 5.0.0, @vitejs/plugin-react 5.2.0 |
| UI | React 19.3.0, react-dom 19.3.0, dockview-react 8.3.1, zustand 5.0.15, immer 11.1.18, zod 4.6.5, Tailwind 4.3.3 with @tailwindcss/vite 4.3.3, radix-ui 1.6.7 |
| Editors | monaco-editor 0.57.0, PixiJS 8.21.0 (room editor), Canvas 2D (sprite editor) |
| Assets and files | pngjs 7.0.0, wavefile 11.0.0, @audio/decode-wav 1.5.0 + @audio/decode-mp3 1.3.1 (both MIT), chokidar 5.0.0, tree-kill 1.2.2 |
| Types | TypeScript 7.0.2, @types/react 19.3.0, @types/react-dom 19.3.0, @types/node 24.13.6 |
| Test, lint, package | vitest 5.0.1, @vitest/browser-playwright 5.0.1, @playwright/test 1.63.0, @biomejs/biome 2.5.14, electron-builder 26.15.3, electron-updater 6.8.9 |

**Type-checking** uses plain `tsc -b`, because `--noEmit` on a referenced project fails with TS6310 on both TS 6.0.2 and 7.0.2.
- Every package tsconfig sets `composite: true, declaration: true, emitDeclarationOnly: true, outDir: 'dist-types'`. The `dist-types` folders are gitignored and Biome-ignored.
- `-b` must be the first argument.
- TS 7.0 has no compiler API. Any tool that needs one uses `typescript@npm:@typescript/typescript6`.

**Monaco** 0.57.0 is imported through its 0.56+ entry points. No `@monaco-editor/react`.

```ts
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/register.all'; // or selected 'monaco-editor/features/<name>/register'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
```

- The old `monaco-editor/esm/vs/...` paths no longer resolve under the exports map, and Monaco's own Vite sample is stale.
- The `editor` entry alone has no completion, hover or find widgets, which is why `register.all` (or selected features) is imported.
- 0.56.0 is the fallback pin.

**Docking** uses `dockview-react` 8.3.1 for the React components. Since 7.x, the `dockview` package is a pure re-export of dockview-core. The stylesheet comes from `dockview/dist/styles/dockview.css`.

**Audio decoding** uses the per-codec MIT packages. The `@audio/decode` umbrella hard-depends on GPL-2.0/LGPL codecs.

**No node-gyp compilation in v1** (this machine has no VS C++ toolchain). The only native code is prebuilt dev-tool binaries: TypeScript 7's Go `tsc`, Biome, esbuild, rollup, @tailwindcss/oxide and lightningcss. None of it is in the packaged app. electron-builder runs with `npmRebuild: false`. A clean lockfile generated on Windows also records the linux-x64 variant of each of these binaries, so cloud clones install them from it (verified 2026-09-25 with npm 11.13; the lockfile rules and `tools/check-lockfile.mjs` are in section 3.4, Rules > Lockfile; cloud handling in section 7.5).

**Electron setup:**
- The root `package.json`'s `postinstall` runs `tools/postinstall.mjs`, which runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1` (set in cloud sessions, which never run Electron). The install is needed for three reasons:
  - Electron 42+ has no postinstall of its own and downloads its binary lazily.
  - electron-vite 5.0.0 throws `Electron uninstall` when `node_modules/electron/path.txt` is missing.
  - Playwright's first launch would otherwise download 158 MB inside its timeout.
- `ELECTRON_OVERRIDE_DIST_PATH` is documented for offline setups.
- **Security defaults stay on:** contextIsolation, a CJS preload, `setWindowOpenHandler`, and `sandbox: true`. The sandbox is set explicitly, because electron-vite's template ships `sandbox: false`.
- **CSP:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:`.
- **`app://`** is registered as standard, secure and supportFetchAPI before ready. A `file://` fallback is kept for the Phase-0 spike.
- **`chokidar` 5** is ESM-only, so it is bundled, not externalised.
- **IPC** is a zod-typed channel map.
- **Playwright** runs `electron-vite build` first, then `_electron.launch({ args: ['.'], cwd: path.resolve(import.meta.dirname, '..') })` from a test file in `apps/ide/tests/`. The EnableNodeCliInspectArguments fuse is left on for test builds.

**Rejected:**
- Tauri (no Rust).
- Avalonia/PySide (weaker editor story).
- electron-vite 6 beta.
- monaco-languageclient (forces editor overrides).
- tRPC adapters (stale).
- The `dockview` package for React (it has no React components).
- The `@audio/decode` umbrella (GPL/LGPL codecs).

### 2.6 Emulator and log capture

**melonDS 1.1 is the default.** It needs no BIOS for DS-mode homebrew, has a GDB stub on 3333/3334, forwards no$gba debug output to stdout, and is closest to hardware.
- It ships with **no key bindings**, so the IDE writes `melonDS.toml` before every launch, with the key map shown on the Controls card (section 6 WS6).
- It lives in `%LOCALAPPDATA%\DSDude\emulators\melonDS-1.1\`. Each development worktree uses its own `DSDUDE_HOME` in place of `%LOCALAPPDATA%\DSDude` (section 6 WS1).
- melonDS 1.1 is a portable build, so its toml lives beside `melonDS.exe`.
- It is downloaded from `https://github.com/melonDS-emu/melonDS/releases/download/1.1/melonDS-1.1-windows-x86_64.zip` and verified against SHA-256 `9F3F8A244103BE20B5B657AF5B0ED1B2A66BB20A7181476A6D294C9A53D4F8C8` (19,484,283 bytes; computed from the copy downloaded during research).
- The installer bundles the same build (section 6 WS8).

**DeSmuME 0.9.13 is a second profile.** The IDE copies `DeSmuME_0.9.13_x64.exe` from `C:\Users\zache\Downloads\desmume-0.9.13-win64\` into `%LOCALAPPDATA%\DSDude\emulators\desmume-0.9.13\` and writes `desmume.ini` beside it. It is never copied under `%TEMP%`, because its ini would then go elsewhere.

**Debug output** (`docs/research/verification.md` claim 6):
- **DeSmuME.** The official build has no GDB stub. It ignores the `0x04FFFAxx` registers and prints only the legacy `mov r12,r12; b; .hword 0x6464` signature (ARM or Thumb), through `printf` with no newline and no `fflush`.
- **melonDS 1.1.** It prints the ARM9 no$gba registers:
  - `0x04FFFA10`: raw, up to 1023 chars;
  - `0x04FFFA14`/`0x04FFFA18`: with `%param%` substitution, truncated at 120 chars, where `18` adds a newline.

  In its interpreter (JIT off, the default) it **also** prints the legacy signature on both CPUs, so printing through both protocols would duplicate every line on melonDS.

The runtime therefore picks one protocol at boot from the emulator ID at `0x04FFFA00`:
- If the ID starts with `melonDS` or `no$gba`, every `DSD|` line (carrying its own `\n`) is written to `0x04FFFA10`.
- Otherwise (DeSmuME, hardware), the line is copied into a writable RAM stub carrying the legacy signature. This follows BlocksDS's ARM7 `debugprint.s`; the Thumb form is fine.

libnds `nocashMessage()` is not used for `DSD|` lines, because it writes `0x04FFFA14` (no newline, 120-char truncation). Message buffers live in main RAM, because melonDS reads them through the ARM9 bus, which does not map DTCM.

**Log capture in v1 is pipes.**
- **Spawn.** The emulator is spawned as `spawn(exe, [rom], {cwd, stdio:'pipe'})`, **without** `windowsHide`. Node would set STARTF_USESHOWWINDOW + SW_HIDE, and Windows applies that to a GUI emulator's first `ShowWindow`, which hides its window.
- **Buffering.** Both emulators write stdout through the CRT with no `fflush`. A pipe therefore receives output in ~4 KB blocks or at clean exit, and TerminateProcess discards the tail.
- **Flush pad.** To make lines live, the runtime follows every `DSD|READY`, `DSD|ERR` and `DSD|STAT` line with a flush pad of >= 5 KB: at least five `DSD|PAD|` lines of <= 1023 chars each, so every pad line fits the `0x04FFFA10` limit. The IDE parser drops every `DSD|PAD|` line.
- **Stop.** Stop sends `taskkill /PID` (WM_CLOSE) and waits up to 2 s for exit, which flushes the buffer, before using `/F`.
- **On-device output.** An on-device console overlay (toggled with SELECT) and the red error box on the bottom screen are drawn on the BG0 UI layer (section 3.3).
- **ConPTY.** ConPTY/node-pty is not the fix, because a GUI-subsystem process does not attach to a pseudo-console. It remains an optional experiment only.

Headless screenshots for tests and CI use py-desmume 0.0.9 (SkyTemple fork core, 0.9.12) with `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy`, through `dsdude screenshot` (section 6 WS1; `docs/research/verification.md` claim 10).

**Rejected for v1:** EmulatorJS in-window preview (COOP/COEP, GPL-3 in the renderer, older core).

### 2.7 Language and file layout

The language is **DSS (DSDude Script)**, with files named `*.dss`. It has C-like syntax, GML semantics and a deliberately small surface.

**Object events are one file per event** (`objects/obj_bird/step.dss`). This:
- mirrors how GameMaker stores events;
- makes the object editor a real file list;
- keeps `event` out of the grammar;
- gives error locations like `obj_bird / Step, line 3` for free.

The files are stored separately but shown stacked in one scrollable panel, with the event list as a jump bar (section 6 WS6). `functions.dss` is created from the fixed 'Functions' pseudo-event at the bottom of that list.

Object-scoped helper functions live in `objects/<name>/functions.dss`, and global functions in `scripts/*.dss`.

**Rejected:** one file per object with `event name { }` blocks (fragile scroll-to-block text sync).

### 2.8 Numbers

DSS has one language-level `number` with two hidden representations:
- **int32** for whole numbers;
- **Q20.12 fixed point** for fractions (libnds `f32`: range +-524,288, resolution 1/4096).

Promotion is Lua-5.3-style: int op int stays int, and anything fractional becomes fixed. The rules for `/`, `div`, `mod`, rounding, comparison and formatting are:
- `/` yields an int when both operands are ints that divide exactly. When the exact result does not fit Q20.12 (|q| >= 524,288), it yields the truncated int quotient.
- `div` is integer division.
- `mod` and `%` accept fractions. The remainder takes the dividend's sign, as in GML.
- `floor/ceil/round/irandom` return ints. `round` rounds half away from zero.
- Int-vs-fixed comparisons are done in 64 bits (`(int64)a << 12` vs `b`).
- Mixed arithmetic whose result does not fit Q20.12 raises R52x in debug builds and wraps in release.
- Division by zero and `sqrt` of a negative are always R5xx. `INT_MIN / -1` wraps.
- `point_direction` returns degrees as Q20.12 in [0, 360), counter-clockwise with y pointing down as in GML, exact at multiples of 45. It uses an integer octant-LUT `atan2` in `fixed.c`, with a host/DS equivalence fixture.
- `string(n)` prints integers without decimals. A fraction's exact Q20.12 value is rounded half away from zero to two decimals, then trailing zeros and a trailing point are dropped (`2.5`, `0.1`; 0.125 prints `0.13`, 2/3 prints `0.67`). It never prints `-0`.
- Booleans print as `true`/`false`, `undefined` as `undefined`, arrays as `[1, 2, 3]`, and instance and asset ids as numbers.

**Overflow.**
- Multiplication uses 64-bit intermediates (`smull`).
- `point_distance`/`point_direction`/`lengthdir_*` compute in 64-bit.
- Debug builds trap int32 overflow (`__builtin_*_overflow`, section 2.4) with a message that quotes the source line. Release builds wrap.
- The checker warns (W04x) when a fixed-point position is squared.

**Trig** uses the vendored libnds LUTs (section 2.4), with degrees converted at the boundary. There are no doubles anywhere: soft-float costs 100+ cycles per op.

**Watchdog.** A per-frame instruction watchdog stops a script that runs more than 200,000 instructions in one frame, with R510 *"obj_x / Step never finished: a loop there seems to run forever"*.

### 2.9 Assets

**Decision.** An in-house RGB555 quantizer (32x32x32 histogram, Wu/median-cut to 15 or 255 colours, optional Floyd-Steinberg/Bayer) feeds **grit `-ftr` (GRF)** behind a `ToolPaths` seam. All grit command lines below were verified with the shipped BlocksDS 1.24.0 `grit.exe` (`docs/research/verification.md` claim 5).

**Loading on the DS.** GRFs are loaded with stock `grfLoadPath()` into malloc'd RAM (pointer-to-NULL destinations), copied to VRAM with `dmaCopy`, and freed immediately in LIFO order. VRAM pointers are never passed as destinations for uncompressed chunks, because `grfLoadPath` does a raw `fread` into the destination.

GRFs come only from the grit of the same BlocksDS release as libnds. The GRF container changed in 1.16.0, and devkitPro grit writes the unsupported `HDR ` header.

**Sprites:**
- The command is `grit sheet.png -gB8 -gt -gTFF00FF -m! -ftr -fh! -W1 -o <out>`, run on an indexed PNG from the quantizer with magenta at index 0. If the transparent colour is absent, grit swaps an unused index into slot 0 and nothing is transparent.
- `-fh!` stops a stray `<out>.h` from landing in `build/nitrofs`.
- Frames are stitched vertically in a sheet as wide as one frame, with file stride `(w/8)*(h/8)*64` bytes (x32 at 4bpp).
- The OBJ VRAM uploader places each frame at a 128-byte-aligned offset, because `SpriteMapping_1D_128` addresses OBJ VRAM in 128-byte units.
- VRAM stride is therefore `roundUp(frameBytes, 128)`. This pads 8x8 8bpp frames and 8x8/16x8/8x16 4bpp frames, and the manifest counts the padded bytes.
- The 4bpp variant `-gB4 -pn16` is used when the auto mode picks 16 colours (<= 15 opaque + transparent).

**Backgrounds:**
- The command is `grit bg.png -gB8 -gt -m -mLs -mRtf -gTFF00FF -ftr -fh! -W1 -o <out>`.
- `-mRtf` is grit's default and is kept for clarity.
- **Never use `-mRtpf` on 8bpp.** It merges tiles that differ only in the upper nibble and writes bogus palette-bank bits.

**Sounds** (mmutil behaviour verified with the shipped `mmutil.exe`, `docs/research/verification.md` claim 9):
- Decode with `@audio/decode-wav`/`@audio/decode-mp3` and resample to mono 16-bit <= 22050 Hz.
- Write with `wavefile`, containing only `fmt `, `smpl` (loop >= 16 samples) and `data` chunks. mmutil is not RIFF pad-byte aware and rejects odd LIST chunks.
- Then run:

  ```
  mmutil <WAVs sorted by name> <modules sorted by name> -d -o<abs build>/nitrofs/soundbank.bin -h<abs build>/soundbank.h
  ```

  - Option values are attached; a space turns the path into an input file.
  - The cwd is a writable build dir, because mmutil creates `mm_*_tmp.*` there.
  - Delete both outputs first and treat a missing output as failure. mmutil exits 0 when it cannot open the header, and leaves a partial header on bad input.
- Read ids from `soundbank.h` (CRLF lines). SFX ids share one counter with samples embedded in modules, so ids are not simply name order.
- Sound stems are ASCII, contain no '.', and are <= 63 chars.
- `mmutil.exe` and `libmm9` always come from the same BlocksDS release. The shipped 1.24.0 mmutil writes MAS 0x18.

**Audio in the IDE:**
- Dropping `.mp3` as music gives E4xx: *"The DS can't play MP3 music. Music must be a tracker file (.xm/.mod/.it/.s3m); pick one from the built-in library"*. MP3 remains accepted for short effects.
- Templates ship 3-4 CC0 tracker tracks and 8 CC0 effects ("Add from library").
- The manifest records RAM bytes per sound, and the status bar shows a Sound memory meter against `soundRamBytes`.
- The runtime's init order (`nitroFSInit` → `soundEnable()` → `mmInitDefault`) and its return-code checks are in section 3.3.
- WAV streaming music (`mmStreamOpen`) and an 8-bit effect option are v1.1.

An in-house GRF writer is an acceptable v1.1 swap behind the same contract, if bundling grit and its DLLs proves painful.

**Rejected:**
- Custom `.spr/.bgt/.tls` formats (loader work on both sides for no gain).
- libimagequant (GPL).
- ffmpeg-static (GPL, 100 MB).
- The `@audio/decode` umbrella (GPL/LGPL codecs).

### 2.10 Repository location, governance and calendar

**Location.** The repo stays at **`C:\Users\zache\OneDrive\Desktop\Projects\DSDude`** (user decision, 2026-09-25). Desktop is OneDrive-redirected, but nothing syncs: the client is not running, no file is a cloud placeholder, and most OneDrive features are disabled (checked 2026-09-25).
- **Day 0 in place** (commands in section 7.1):
  - `git init -b main` and the shared repo config;
  - a minimal `.gitignore` before the first commit, because the repo goes to GitHub and the proprietary `mwccarm` must never be pushed;
  - `mwccarm\` into `vendor\mwccarm\`, and `dsd-windows-x86_64.exe` into `vendor\dsd\`;
  - a commit of `PLAN.md`, `CLAUDE.md`, `docs/` and `.gitignore`, then the push to `origin`.
- **Local worktrees** are sibling folders, `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws<n>` (`..\DSDude-ws<n>`). The root path is 47 characters, so `core.longpaths=true` stays and build paths stay under 250 characters. `DSDUDE_HOME` is `<worktree>\.dsdude`; WS0's is `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude`. Cloud sessions work in clones of `origin`, with `DSDUDE_HOME=$HOME/.dsdude`.
- **Residual risk** (risk 10): if OneDrive sync is ever re-enabled for Desktop, `node_modules`, `.git` and `.dsdude` would lock. `tools/checkpoint.ps1` and `dsdude doctor` warn when `OneDrive.exe` runs and the repo path is under `%OneDrive%`. If the warning fires, pause the instances and turn Desktop sync off.

End users' projects follow their own rule:
- New Project defaults to `%USERPROFILE%\DSDudeProjects`, because Desktop and Documents are often OneDrive-redirected with sync on.
- The wizard warns when the chosen path is under `%OneDrive%`.
- A project's `build/` lives in `%LOCALAPPDATA%\DSDude\build\<project-hash>` rather than inside the project. Export .nds copies from there.
- The `build/...` paths in section 3.2 are relative to that directory.

**GitHub.** `origin` is a private GitHub repo named `dsdude` (open question 2 supplies its URL). Cloud sessions need it.
- Creating it is the user's outward-facing action on Day 0; no instance creates it. `gh` is not installed, so section 7.1 gives a browser route and a `winget install --id GitHub.cli -e` route.
- The Claude GitHub App is installed at `https://github.com/apps/claude/installations/new` with **Only select repositories** set to `dsdude`. It gets read/write access to Actions, Contents, Issues, Pull requests, Workflows and more, and GitHub allows no subset. Without the App, `claude --cloud` uploads a bundle instead of cloning.
- `vendor/` never reaches GitHub (section 2.2). After the first push, Day 0 checks that `git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md'` prints nothing, so no vendor file is anywhere in GitHub's history.
- The local repo stays the source of truth: the integration runs on `main` here and never needs GitHub. After every run WS0 pushes `main`, `docs/status/checkpoint-N.md` and every gate tag (`phase0`, `toolchain-ok`, `cp-a`, ...) to `origin`, where the cloud streams read them.
- Public releases, electron-updater's GitHub Releases provider and the unsigned installer are decided by M6 (open question 6).

**Ownership is mechanical.**
- `tools/ownership.json` is the single source: path glob → owner, with `from`/`until` fields that name git tags on main (section 3.4).
- The pre-commit hook `tools/check-ownership.ts` identifies the stream from `git config --worktree dsdude.ws`. It is a convenience only. `.githooks/commit-msg` adds a `DSDude-WS: WSn` trailer from the same setting. A cloud clone sets `dsdude.ws` with its first command (below), and there `tools/check-ownership.ts` reads `origin/main` when there is no local `main`.
- WS0's integration script is the enforcement point. It checks each non-merge commit in `main..<ref>` against `ownership.json` at main's HEAD, for the stream named in that commit's `DSDude-WS:` trailer (the branch's or registry's stream if the trailer is missing), and refuses the merge on violations. `<ref>` is `wsN-<name>` for a local stream and `origin/<push target>` from `docs/status/cloud.md` for a cloud stream (section 7.2). Checking per commit lets the `ws2-*`/`ws4-*` cross-merges of section 7.4 pass.
- Four shared-file rules are in section 3.4: any contract owner may append to `contracts/CHANGELOG.md` for its own contracts (and WS7 under the C2 `builtins.json` section for its doc/example fills), any stream may create a new `docs/adr/NNNN-*.md`, WS7 may fill the `doc`/`example` fields of `contracts/builtins.json`, and WS0 appends `IF-` entries to the closing `## Integration feedback` section of each stream's `docs/status/wsN.md`, which the stream itself never edits.
- CODEOWNERS is generated from `ownership.json` for information only; the integration uses no PRs.

**Contract changes are tiered** (section 7.4):
- **T0** (doc/example text, comments): the owner commits directly with a `contracts/CHANGELOG.md` line.
- **T1** (additive): the owner commits with a minor version bump, regenerated outputs and a CHANGELOG entry. WS0 reviews it within 24 hours at the daily integration.
- **T2** (breaking): an ADR (`docs/adr/NNNN-title.md`) co-signed by every affected owner, merged by WS0.

A blocked stream marks its local assumption `// ADR-pending` and keeps going. "PR" in this plan means "branch merged by WS0"; cloud sessions never open one.

**WS0 and Phase 0.**
- WS0 is a persistent local Claude Code instance on `main` in the repo root. It integrates local and cloud stream branches daily and pushes the result to `origin` (section 7.2).
- The user decides ADRs and open questions, does the physical tasks, launches the cloud sessions, relays "WS0 merged checkpoint-N" to them and approves checkpoint reports: about 1-2 hours a day (section 7.2).
- Phase 0 is budgeted at **2 days** of minimum-viable scope (section 7.1). A Claude WS0 instance does the work, and the user approves at the end of each day.
- Phase 0 ends in a `git tag phase0` gate. In hybrid mode the gate also needs WS0's cloud pieces on `origin/main` and either a green Day-1 cloud probe or a recorded fallback (sections 7.1 and 8).
- WS1's toolchain install runs from hour zero and ends in its own `toolchain-ok` gate, which releases WS3 (in the standard-mode fallback, WS3 also waits for slot 1 at M0).

**Operating mode: hybrid (user decision, 2026-09-25).** Measured on 2026-09-25:
- **Hardware:** 11.3 GB usable RAM (8 GB + 4 GB DDR4-3200 SO-DIMMs, both slots full, board maximum 64 GB) and 16 threads (Ryzen 7 5825U).
- **Per Claude Code instance:** ~350 MB working set and ~600 MB private, growing with context.
- **Background apps:** ~3 GB.
- **With one Claude session running:** 3.2 GB free, and commit charge at 14.6 of 24.8 GB, so the page file was already in use.

Local RAM therefore caps the local instances at the standard-mode limits. Streams that need Windows tools run locally; the headless streams run as Claude Code cloud sessions on the GitHub repo, which use no local RAM. Every kickoff file assumes hybrid mode.

| Stream | Where | Starts | Why there |
|---|---|---|---|
| WS0 lead/integrator | local, `main` in the repo root | Day 0 | `tools/checkpoint.ps1`, the MSYS2 host goldens, the BlocksDS runtime build, `dsdude screenshot` (py-desmume) and the emulators. Integrates local and cloud branches. |
| WS1 toolchain/Play | local, slot 1 | hour zero | Installs BlocksDS into `C:\msys64`; emulators; Windows process spawning. |
| WS3 DS platform | local, slot 2 | `toolchain-ok` | The BlocksDS DS build, the selftest ROM, emulator checks. |
| WS6 IDE shell | local, slot 3 | tag | Electron on Windows: spawning, paths, NSIS behaviour. |
| WS8 release | local, slot 1 | CP-C (M1), with WS1's leftovers | The NSIS installer, the clean-VM test, e2e with the emulators. |
| WS2 runtime core | cloud, `dsdude-ws2` | tag | The host build with Linux gcc (section 2.4). WS3 and WS0 check the DS compile of the core locally. |
| WS4 compiler | cloud, `dsdude-ws4` | tag | Pure TypeScript. |
| WS5 asset pipeline | cloud, `dsdude-ws5` | CP-A (D+3) | The pure-TS parts: decode, quantizer, stitching, manifest, preview, budgets. Real grit/mmutil tests skip when `ToolPaths` is empty, and WS0's local integration runs them. |
| WS7 learn | cloud, `dsdude-ws7` | CP-A (D+3) | Headless first: gen-docs, templates, the Monarch tokenizer, builtins-only completion, the manual. Monaco glue is tested in headless Chromium; only WS6 and WS0 open the Electron IDE. |
| WS6b editors (optional) | cloud, `dsdude-ws6b` | CP-B (D+7) | Only if usage limits allow; otherwise WS6 builds the editors. `packages/editor-core` and mock-host browser tests; WS6 checks the shell integration locally. |

Standard and upgraded modes stay documented only as fallbacks. Section 7.2 has the schedules and section 8 the milestone criteria.

| | Hybrid (chosen) | Standard mode (fallback, 12 GB) | Upgraded mode (fallback, 32 GB, e.g. 2 x 16 GB DDR4-3200 SO-DIMM) |
|---|---|---|---|
| Applies | Always, unless a fallback trigger below fires | GitHub or cloud sessions fail, or usage limits cannot be absorbed | After a RAM upgrade |
| Claude Code instances | Local: WS0 + at most 3 stream instances. Cloud: up to 5 sessions. Peak ~4 local + 4-5 cloud | WS0 + at most 3 stream instances | WS0 + up to 7 stream instances |
| Electron dev IDE / emulator | At most one Electron dev IDE and one emulator window, machine-wide; none in the cloud | At most one Electron dev IDE and one emulator window, machine-wide | At most one Electron dev IDE (WS6 only until CP-C); one emulator per worktree |
| Other apps | Discord and Creative Cloud closed. One claude.ai/code tab is allowed for steering cloud sessions (or use the mobile Code tab or the CLI) | Browser, Discord and Creative Cloud closed during sessions | Not required; the memory gate decides |
| Stream schedule | Local slots:<br>- slot 1: WS1 → WS8 at CP-C;<br>- slot 2: WS3 from `toolchain-ok`;<br>- slot 3: WS6 from the tag.<br><br>Cloud: WS2 and WS4 at the tag; WS5 and WS7 at CP-A; WS6b at CP-B if usage limits allow. | Three slots; a stream passes its slot on at its hand-off point:<br>- slot 1: WS1 → WS3 → WS8;<br>- slot 2: WS2 → WS7;<br>- slot 3: WS4 → WS5 → WS6.<br><br>WS6b is folded into WS6 unless the memory gate allows it. WS1's leftovers (tools pack, `dsdude doctor`, DeSmuME-profile polish, and wiring `compileProject`/`packAssets` into `BuildService` for whichever has not landed by the hand-off) move to WS8. | Waves:<br>- at the tag: WS2, WS4 and WS6;<br>- at `toolchain-ok`: WS3;<br>- at CP-A: WS5;<br>- at CP-B: WS7;<br>- at CP-C: the WS1 instance becomes WS8.<br><br>WS6b starts only if the memory gate allows it. |
| Release 0.1 | Around week 12-14 | Around week 16-20 | Around week 12 |

**Hybrid rules.**
- Hybrid uses upgraded mode's milestone criteria (M0 includes IDE Play and the selftest ROM), its checkpoints (CP-A D+3, CP-B D+7, CP-C D+14, then weekly), its freezes and its ownership events. The standard-mode holding row that gives WS1's paths to WS0 from `cp-b` until `start-ws8` is not created.
- **Usage limits.** ~4 local + 4-5 cloud sessions run on one Claude plan at peak; the user confirms before the tag that the plan covers it (open question 3). If limits bite, WS6b is dropped first, then WS7 and WS5 wait for a free cloud slot.
- **Fallback.** WS0 switches to standard mode, records the switch in the `CLAUDE.md` Status block and re-plans at the next checkpoint when GitHub or cloud sessions are unavailable for more than a day, when every push target is refused, or when staggering cannot absorb the usage limits. A cloud stream then continues locally with `git fetch origin; git worktree add -B wsN-<name> ..\DSDude-wsN origin/<push target>`, followed by the usual worktree setup (`docs/kickoff/README.md` section 3). After a RAM upgrade, upgraded mode applies: the local cap becomes 8 instances, and cloud streams may move to local worktrees the same way.

**Calendar.** Hybrid runs close to the upgraded calendar, plus the integration round-trips to the cloud streams:

| | phase0 | toolchain-ok | M0 | M1 | M2 | M3 | M4 | M5 | M6 (0.1) |
|---|---|---|---|---|---|---|---|---|---|
| **Hybrid** | day 2 | day 1-3 | wk 2 | wk 3 | wk 4-5 | wk 6-7 | wk 8-9 | wk 10-11 | wk 12-14 |
| Standard (fallback) | day 2 | day 1-3 | wk 2 | wk 4-5 | wk 7-8 | wk 11-12 | wk 14-16 | wk 15-17 | wk 16-20 |
| Upgraded (fallback) | day 2 | day 1-3 | wk 2 | wk 3 | wk 4-5 | wk 6 | wk 8 | wk 9-10 | wk 12 |

The hybrid placement and the standard-mode slot order both respect the milestone prerequisites:
- **M0** needs WS1's `packRom` + `EmulatorManager` + log capture.
- **M1** needs WS2's VM, WS3's platform, and either WS4's codegen or hand-assembled bytecode.
- **M2** needs WS5 plus the WS2 engine and WS3.
- **M3** needs WS6 and WS7's language service.

**Memory gate (every mode; in hybrid it governs the local instances).** `tools/memsampler.ps1` samples memory once a minute, and `tools/checkpoint.ps1` reports the minimum available memory and the peak commit charge since the last checkpoint (section 7.2). An instance is added only if minimum available memory stayed above 1.5 GB.

**Thermal limit (local).** On 2026-09-25, a planning workflow running ~16 concurrent agents made the laptop log a critical thermal event and hibernate for three hours. The hybrid local cap (WS0 + 3) is far lighter, but builds and test runs add CPU heat. Keep the laptop on AC power with the vents clear. Parallel CPU work stays within `make -j4` and `--maxWorkers=2`. If Windows logs Kernel-Power event 88 ("hibernated due to a critical thermal event"), drop to WS0 + 2 local instances until the cause is fixed. `tools/checkpoint.ps1` reports any such event since the last checkpoint.

**Cloud sessions.** Each cloud stream is a Claude Code cloud session (an Ubuntu VM with `CLAUDE_CODE_REMOTE=true`) in its own environment `dsdude-wsN`, working in a clone of `origin`. Section 7.5 has the short procedure and `docs/kickoff/README.md` section 8 the canonical one: environments, setup script, launch, first commands, pushing and resume. The rules that shape this plan:
- **Branches.** The stream line is `wsN-<name>`; WS0 tags `start-wsN`, creates the branch and pushes it at launch. A session pushes only with `bash tools/cloud/push.sh`, after every green batch. The official docs allow a session to push only to its current working branch, so `push.sh` tries the recorded target, `wsN-<name>`, `claude/wsN-<name>` and the session's own branch in that order, and a new target is recorded under `Cloud push target:` in `docs/status/wsN.md`. WS0 keeps the registry `docs/status/cloud.md`.
- **First commands.** Repo config is not cloned, so every session starts with `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn`, then `bash tools/cloud/start.sh`.
- **Merging.** Daily `git fetch origin && git merge origin/main`. Never rebase after WS0 has merged.
- **State.** Sessions are ephemeral. All state lives in the pushed branch and `docs/status/wsN.md`, and a new session resumes from the kickoff paste prompt plus "continue from docs/status/wsN.md".
- **Installs.** Cloud sessions run `npm install`, never `npm ci`, and never commit `package-lock.json`. Only WS0 regenerates the lockfile, on Windows (section 3.4).
- **Local-only checks.** Anything that needs MSYS2, BlocksDS, an emulator or Electron stays local. At every integration WS0 runs each cloud stream's local-only checks (real grit/mmutil, MSYS2 gcc, the DS build of the core, emulators, Electron). It appends each failure as an `IF-` entry to that stream's `docs/status/wsN.md` and reports it in the checkpoint report; the stream fixes open entries first.
- **Day-1 probe.** Before the tag, the user opens one probe session that checks the tools, the hooks, the push targets and the Playwright download (section 7.1). If it fails, the cloud streams due at the tag wait under the fallback rule.

The internal checkpoints CP-A/CP-B/CP-C are in section 7.3.

**Rejected:**
- A 4-6 hour Phase 0 (not credible).
- A week-long draft window (invites churn).
- 6-8 week release targets (they underestimate a VM + engine on libnds).
- Seven or eight concurrent instances with several Electron dev IDEs on 12 GB. That exceeds this machine's memory, and swapping would time out every stream's tests.
- WS0, WS1, WS3, WS6 or WS8 as cloud sessions: MSYS2, BlocksDS, the emulators and Electron on Windows exist only on this machine.
- CODEOWNERS or a bypassable pre-commit hook as the enforcement point.

### 2.11 Licensing

**Our code.** The IDE and TypeScript packages are MIT. The runtime C code is Zlib, and user games carry only maxmod's ISC notice.

**Third-party tools.** Host tools (ndstool GPL-3, grit GPL-2, mmutil ISC, GCC runtime DLLs) and emulators (melonDS GPL-3, DeSmuME GPL-2) run as separate processes. This keeps the IDE non-GPL (`docs/research/verification.md` claim 7).

**Installer.** The installer bundles the tools pack and melonDS 1.1 (section 6 WS8). It ships their license texts and SHA-256s:
- ndstool: `COPYING.gpl3` + `COPYING.mit`.
- grit: `COPYING` (GPL-2.0-only) + `licence-mit.txt` + the libplum notice.
- mmutil: ISC.
- The GCC Runtime Library Exception notice for `libstdc++-6.dll`/`libgcc_s_seh-1.dll`/`libwinpthread-1.dll`.
- The libiconv (LGPL) notice.
- melonDS: GPL-3.

**GPL source.** The exact Corresponding Source archives are uploaded to the same GitHub Release as the installer (whether releases are public is open question 6):
- the BlocksDS v1.24.0 ndstool and grit sources, plus the packaging scripts;
- the melonDS 1.1 source.

GPL-2 section 3 requires equivalent access "from the same place", so links to upstream are not enough.

**Excluded.** DeSmuME is not bundled; it is an optional profile. Nothing from mwccarm or NitroSDK enters git or the product.

## 3. Architecture

### 3.1 Components

```
 ┌──────────────── IDE: Electron 44  (apps/ide WS6 · editors WS6b · packages/monaco-dss WS7) ─────────────────┐
 │ Renderer (React 19, dockview-react): Project tree │ Monaco DSS │ Object ed │ Sprite ed │ Room ed (Pixi)    │
 │   zustand store ─ @dsdude/project-format (zod) ─ @dsdude/language-service (Web Worker over @dsdude/lang)   │
 │   Output / Problems / status-bar meters (runtime-limits.json + assets.manifest.json)      ▶ Play ■ Stop    │
 │──────── preload: invoke/on over @dsdude/ipc-contract (zod channel map, sender validation) ─────────────────│
 │ Main: settings, chokidar watcher, EmulatorManager (step 7; owns the emulator child and its PID file),      │
 │       utilityProcess "build worker" hosting BuildService (steps 3-6)                                       │
 └────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┘
                                                  │ build.play({projectPath, emulator})
 ┌──────────────── @dsdude/toolchain + @dsdude/cli  (build worker, or the `dsdude` CLI in one process; WS1) ──┐
 │ 1 load+validate  2 @dsdude/asset-pipeline (WS5)      3 @dsdude/compiler (WS4)  4 pack      5 run           │
 │   project files  PNG → quantize → grit -ftr → *.grf  *.dss → game.dsdb         ndstool -c  EmulatorManager │
 │                  WAV/XM → mmutil → soundbank.bin     (ABI hash, ROOMS, DBG)    + header    (IDE main):     │
 │                  → assets.manifest.json                                          check     melonDS or      │
 │                  per-room budget check ◄─────────────── room asset sets                    DeSmuME         │
 └────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┘
                                                  ▼
   build/nitrofs/{game.dsdb, gfx/*.grf, bg/*.grf, soundbank.bin}              runtime/dist/arm9.elf (WS3)
                                                  │                                     │
      ndstool -c build/game.nds -9 arm9.elf -7 <BlocksDS>\sys\arm7\main_core\arm7_maxmod.elf -b icon.png "T;S;A" -d build/nitrofs
                                                  ▼
 ┌──────────────── game.nds on melonDS / DeSmuME / real DS ───────────────────────────────────────────────────┐
 │ ARM9 runtime:  runtime/core (WS2): DSDB loader → VM (vm.arm.c, ITCM, computed goto) → engine (instances,   │
 │                events, rooms + asset sets, collision grid, alarms, animation, OAM builder, UI layer)       │
 │                ── dsd_platform.h ──►  runtime/platform/ds (WS3): libnds oam*/bg*/grfLoadPath/touchRead,    │
 │                maxmod, NitroFS, log port (0x04FFFA10 or legacy signature, picked at boot)                  │
 │ ARM7: BlocksDS arm7_maxmod.elf (touch, sound mixing, RTC, power)                                           │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   Host build (not on the DS): runtime/host (WS2) + the same runtime/core → dsdude-host.exe (MSYS2 gcc, local)
                               or dsdude-host (Linux gcc, WS2's cloud session): JSONL trace, PNG frames, scripted input

   contracts/builtins.json ── tools/gen-builtins.ts ──► runtime/gen/builtins_table.h · packages/compiler/src/gen/builtins.ts
                                                        · packages/language-service/src/gen/builtins.ts
   contracts/opcodes.json  ── tools/gen-opcodes.ts  ──► runtime/gen/opcodes.h · packages/dsdb/src/gen/opcodes.ts
   builtins.json + the five diagnostic catalogs (project-format, compiler, assets, toolchain, runtime; C9)
                                                        ── tools/gen-docs (WS7) ──► docs/reference/*.md
```

EmulatorManager belongs to `@dsdude/toolchain` but runs in the IDE main process. A hung or crashed build worker can then be restarted without orphaning the emulator. The `dsdude play` CLI runs build and launch in one process.

### 3.2 What happens when you click Play

`build/` below is the project's build directory. It lives at `<DSDUDE_HOME>\build\<project-hash>` (default `%LOCALAPPDATA%\DSDude\build\<project-hash>`), never inside the project folder, and **Export .nds** copies from there (section 2.10). `<project-hash>` is the first 16 hex digits of the SHA-256 of the lower-cased absolute project path. In development, `DSDUDE_HOME` is the worktree's `.dsdude` folder (WS0: `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude`), or `$HOME/.dsdude` in a cloud session.

The full Play path runs only on Windows, in WS0 and the local streams: Electron, the emulators, and grit, mmutil and ndstool from `C:\msys64` are local tools. Cloud sessions (section 7.5) exercise steps 3 and 5 and the pure-TypeScript parts of step 4 on Linux; tests that need `ToolPaths` skip there. WS0's integration runs them locally and reports failures to the owning stream as integration feedback (section 3.4).

1. **Renderer** saves dirty documents, then `invoke('build.play', {projectPath, emulator:'melonds'})`; the toolbar switches to Stop and the store marks the job running.
2. **Main** validates the sender and hands steps 3-6 to the build worker (`utilityProcess.fork`, one per app), which runs `BuildService.build()` from `@dsdude/toolchain` and returns the ROM path. Main then runs step 7 itself. A hung tool never blocks the UI; every subprocess has a timeout.
3. **Load + validate.** `project-format.load()` parses every JSON file with zod; schema problems become E29x diagnostics from the project-format catalog (C9).
4. **Assets (ms, cached).** `packAssets()` from `@dsdude/asset-pipeline` (C4 `PackAssetsFn`) content-hashes every sprite/background/sound/icon under `build/cache/<sha256>/` and converts only changed ones (section 2.9). It writes `build/nitrofs/gfx`, `bg`, `soundbank.bin`, `build/icon.png` (quantised to 32x32 with <= 15 colours + transparent, as ndstool `-b` requires) and `build/assets.manifest.json`: ids (sound ids always read from the generated `soundbank.h`), dimensions, frame counts, palette use, OBJ VRAM bytes in 128-byte-aligned frame slots, and sound RAM bytes. Per-asset limit violations are E4xx with exact numbers and a fix.
5. **Compile (ms).** `compileProject()` from `@dsdude/compiler` (C4 `CompileFn`) parses all `.dss` files, binds objects/events/scripts/rooms, resolves asset names through the manifest, runs the checker, and computes instance slot layouts and each room's asset set (rules below). It emits `build/nitrofs/game.dsdb` with the builtins ABI hash, the ROOMS table and the DBG line table. The pipeline's per-room budget check (`checkRoomBudgets`, C4) then totals OBJ VRAM, palettes and sound RAM per room and screen from those sets, adds the figures to the manifest, and reports overflows as E4xx. Errors stop here; diagnostics stream as JSON lines and become Monaco markers and Problems entries.
6. **Pack (ms).** `packRom()` runs `ndstool -c build/game.nds -9 <runtime>/arm9.elf -7 C:\msys64\opt\wonderful\thirdparty\blocksds\core\sys\arm7\main_core\arm7_maxmod.elf -b build/icon.png "Title;Subtitle;Author" -d build/nitrofs`. The `-7` path is always explicit, so ndstool never depends on `$BLOCKSDS`. In development, console tools run with `C:\msys64\opt\wonderful\bin` prefixed to PATH for their runtime DLLs. In the packaged IDE, the tools and `arm7_maxmod.elf` come from `resources/tools-pack/` and `arm9.elf` from the bundled `runtime/dist`.

   `packRom()` then checks ndstool's exit code (a failed run leaves a truncated `.nds`, which is deleted) and reads the header itself: FNT offset/size at 0x40/0x44 and FAT offset/size at 0x48/0x4C. It requires FAT offset >= 0x8000, FAT size > 0, FNT offset >= 0x8000, and the 8 bytes `NitroFS!` at FAT offset + FAT size; `ndstool -i` does not report the magic. Any failure is an E6xx diagnostic.

   ndstool always places the ARM7 at >= 0x8000 (`arm7_min`) with FNT/FAT after it, so the offset checks are sanity assertions. The real failures are an empty NitroFS (FAT size 0, no magic; `game.dsdb` is always packed) and an ndstool older than BlocksDS 1.14.2 (no magic). `nitroFSInit` returns false with ENODEV on a bad FAT or missing magic. An FNT below 0x8000 does not fail init but breaks every path lookup (`docs/research/verification.md` claim 3).
7. **Launch.** `EmulatorManager.launch()` (IDE main process) first stops the previous child: `taskkill /PID` (WM_CLOSE, which also flushes its buffered stdout), then `/F` after 2 s. A second `melonDS.exe` would open a second instance. Before rewriting `melonDS.toml`, EmulatorManager waits for the previous process to exit, because melonDS rewrites its toml on exit.

   It then writes `melonDS.toml` beside `melonDS.exe` in `<DSDUDE_HOME>\emulators\melonDS-1.1\` (melonDS 1.1 is a portable build; `DSDUDE_HOME` is set per worktree in development, section 6 WS1). The toml carries the key bindings of the Controls mapping (section 6 WS6), `IntegerScaling=true`, `3D.Renderer=0`, `Screen.UseGL=false`, `ShowOSD=false`, and `[Instance0.Gdb] Enabled=true` with ports 3333/3334 only when Debug is pressed.

   Finally it calls `spawn(melonExe, [romPath], {cwd: melonDir, stdio:'pipe'})`, without `windowsHide`, which would hide the emulator window. `windowsHide:true` stays only for console tools (ndstool, grit, mmutil, bash). The PID and start time are persisted under `DSDUDE_HOME` and reconciled with `taskkill /T` at startup and before quit.
8. **On the DS.** The runtime:
   - reads the emulator ID at `0x04FFFA00` and picks the one log protocol it will use (C8);
   - runs `nitroFSInit` → `soundEnable()` → `mmInitDefault("nitro:/soundbank.bin")`, checking each result;
   - loads `game.dsdb` and verifies magic/version/ABI hash (a mismatch shows *"This ROM was built for a different DSDude runtime"* instead of crashing);
   - loads the first room's asset set (the DSDB ROOMS table; rules below and C3) into VRAM through malloc'd GRF buffers freed after upload, and preloads its sounds;
   - runs the Create events, then Game Start, then Room Start (C6);
   - prints `DSD|READY|<version>|<abihash>` followed by the flush pad (`DSD|PAD|` lines), then enters the 60 fps loop.
9. **Live.** Both emulators block-buffer stdout on a pipe (section 2.6), so the runtime follows every `DSD|READY`, `DSD|ERR` and `DSD|STAT` line with a >= 5 KB flush pad: at least five `DSD|PAD|` lines of <= 1023 chars each. Main splits the stream into lines, drops every `DSD|PAD|` line, and batches the rest every ~30 ms to the `build.log`/`emulator.log` channels. `DSD|ERR` lines become Problems entries with click-to-line; `DSD|STAT` (once per second) and `DSD|MEM` (room start) update the meters. Stop sends `emulator.stop`, which runs the graceful `taskkill` sequence from step 7, so the tail of the log is not lost.

Warm Play with unchanged assets: compile ~50 ms + pack ~100 ms (ndstool took 36-83 ms on small ROMs, `docs/research/verification.md` claim 3) + emulator boot ~1-1.5 s.

**Room asset sets and room changes** (steps 5 and 8; contracts C3 and C6). A room's asset set consists of:
- the room's per-screen backgrounds, and the sprites and sounds referenced by the objects placed in the room;
- objects reachable, transitively, through `instance_create` in their code;
- `sprite_index` assignments and `draw_sprite`/`audio_*` calls in that code.

The set is split per screen by each object's Screen, and `draw_set_screen` adds the other screen. The compiler emits the set into DSDB ROOMS, and the pipeline budgets OBJ VRAM, palettes and sound RAM per room from it (step 5).

Runtime behaviour:
- `room_goto`/`room_restart` take effect at the end of the frame.
- On a room change, Room End fires for the old room's instances; Destroy does not.
- Screens are blanked (`setBrightness`) while loading.
- Assets are not reloaded when the set is unchanged (`room_restart`).
- The music module and the room's effects are loaded before Room Start.
- Using an asset outside the loaded set raises R5xx *"spr_x is not loaded in rm_y"*; the checker warns statically when it can prove this.

### 3.3 Runtime design summary

**Memory (4 MB main RAM).** BlocksDS crt0 sets the heap end to end-of-RAM minus 48 KB (`0x023F4000`), so the heap is 4,048 KB minus the ARM9 image. The linker caps the static image at 3.5 MB, and the ARM7 runs from its own IWRAM (`docs/research/verification.md` claim 13). Budget, with the C13 key in brackets:
- ARM9 image <= 0.7 MB (expected 0.2-0.4 MB).
- DSDB <= 300 KB (`dsdbMaxBytes`).
- Instance pool 512 x 384-byte blocks = 192 KB (`instancesMax`, `instanceBlockBytes`). Each block is a native C struct of the built-in variables followed by up to 24 user variables as 8-byte cells (section 6 WS2).
- String/array arena 192 KB (`stringArenaBytes`; size classes, ref-counting plus a mark-sweep pass at room change).
- Room arena 512 KB for per-room runtime structures, reset on room change (`roomArenaBytes`).
- Resident sound data (maxmod `mmLoad`/`mmLoadEffect`, malloc'd) <= 768 KB (`soundRamBytes`).
- >= 512 KB of heap kept free for transient GRF buffers, stdio and NitroFS (`heapReserveBytes`).

Every allocator is fixed-capacity. One combined RAM meter and `DSD|MEM` report the real figures, read at boot from `__end__` and `fake_heap_end`.

**VRAM.** The bank table (every enumerator exists in libnds v1.24.0 `video.h`; `docs/research/verification.md` claim 5):

| Bank | Call | Use |
|---|---|---|
| A | `vramSetBankA(VRAM_A_MAIN_SPRITE)` | 128 KB main OBJ |
| B | `vramSetBankB(VRAM_B_MAIN_BG_0x06000000)` | 128 KB main BG |
| C | `vramSetBankC(VRAM_C_SUB_BG)` | 128 KB sub BG |
| D | `vramSetBankD(VRAM_D_SUB_SPRITE)` | 128 KB sub OBJ |
| E | `vramSetBankE(VRAM_E_BG_EXT_PALETTE)` | main BG extended palettes, slots 0-3 |
| F | `vramSetBankF(VRAM_F_SPRITE_EXT_PALETTE)` | main OBJ extended palettes |
| G | `vramSetBankG(VRAM_G_LCD)` | spare |
| H | `vramSetBankH(VRAM_H_SUB_BG_EXT_PALETTE)` | sub BG extended palettes, slots 0-3 |
| I | `vramSetBankI(VRAM_I_SUB_SPRITE_EXT_PALETTE)` | sub OBJ extended palettes |

Both screens then have identical budgets: 128 KB BG and 128 KB OBJ, with all four BG extended-palette slots. Per screen, the BG budget is the UI layer (~4 KB font/solid tiles + 2 KB map) plus the room background (<= 1024 8bpp tiles = 64 KB + map <= 8 KB), leaving >= 40 KB free. Extended palettes are written while their bank is mapped as LCD and then remapped, as in the SDK's sprites_ext_palette example. Extended OBJ palettes are on: per screen, each 256-colour sprite uses one of 16 extended OBJ palettes and each 16-colour sprite one of the 16 standard OBJ palettes, counted per room by the pipeline (`obj256PalettesPerScreen`, `obj16PalettesPerScreen`).

**Sprites.** A logical instance list decoupled from OAM (DSGM's fatal mistake). Each frame the engine builds a shadow OAM per screen, allocates the 32 affine sets per screen, and `oamUpdate()`s at VBlank. The room's sprite frames are uploaded to OBJ VRAM at room start into 128-byte-aligned slots (`SpriteMapping_1D_128`; 128 KB per screen, shown as a meter). The shadow OAM builder follows these rules:
- Shadow OAM is sorted stably by (depth, instance id), identically on host and DS.
- Priority map: UI layer BG0 at priority 0, sprites at 1, room BG1 at 2. In 0.1 no sprite can go behind the background.
- `image_xscale`/`image_yscale` in {1, -1} with angle 0 use the OAM hflip/vflip bits and no affine set.
- Any other angle or scale takes an affine set, with double-size set automatically and origin-correct placement: rotate the origin-to-centre vector, then subtract the double-size half extent.
- Scale is clamped to [1/16, 2], with W04x *"DS sprites can only grow to 2x; use a bigger sprite"*.
- Beyond 32 affine instances per screen, the extras draw unrotated. Beyond 128 visible instances, those with the highest depth values are dropped. Both cases are counted in `DSD|STAT` and shown as red meters.

**Backgrounds and the UI layer.** BG0 on each screen is the **UI layer**: a 4bpp text BG at priority 0 with the built-in 8x8 font (95 ASCII glyphs, linked into `arm9.elf` from `runtime/data/`) plus one solid tile, and a double-buffered 32x32 map that is committed at VBlank and cleared at frame start. The core reaches it through the C11 calls `dsd_plat_ui_text`, `dsd_plat_ui_fill` and `dsd_plat_ui_clear`.
- `draw_text` and `draw_rectangle` snap to 8-pixel cells (documented).
- `draw_set_color` picks one of 16 UI colours (the GML `c_*` names, one standard BG palette each).
- `draw_clear` clears the map.
- The red error box and the SELECT console overlay use the same layer, not libnds `consoleInit`.

The room background is BG1 (8bpp, extended palette slot 1): one GRF text BG per screen per room (<= 512x512, <= 1024 tiles), scrolled by that screen's view. BG2/BG3 stay free for v1.1. Tile painting, ring-buffer scrolling for larger rooms, pixel-exact rectangles, bitmaps and GL2D are v1.1.

**Two screens and collision.** Uniform grid broadphase + AABB/circle narrow phase in C.
- A room is one coordinate space, and each screen shows its own view rectangle of it.
- An instance's `screen` selects the engine and view that draw it.
- Collision events, `place_meeting`, `instance_place` and `collision_*` only match instances with the same `screen` (the DSGM precedent). `room.json` reserves `layout` with the single 0.1 value `"separate"`; a `"stacked"` tall-world mode is v1.1.
- `touch_x`/`touch_y` = stylus position + bottom view offset, keeping the last value while the stylus is up.
- `instance_create(x, y, obj)` uses the object's Screen property.

**Audio.** maxmod through `arm7_maxmod.elf`; `audio_play_sound` = `mmEffect`, `audio_play_music` = `mmStart`.
- Init order is `nitroFSInit` → `soundEnable()` → `mmInitDefault("nitro:/soundbank.bin")`, and the result is checked.
- `mmLoadEffect` return codes are checked: 1 = bad id and 2 = load failed both raise R5xx.
- One-shot effects are started and then `mmEffectRelease`d.
- An invalid handle (all 16 channels busy, shared with the module's channels) is tolerated and counted in `DSD|STAT`.

WAV streaming music (`mmStreamOpen`) and an 8-bit effect option are v1.1. The pipeline and IDE side (tracker-only music, the CC0 sound library, the Sound memory meter) is in section 2.9.

**VM.** Register machine with 32-bit instruction words and computed-goto dispatch in `vm.arm.c`, marked `ITCM_CODE`. It is compiled with `-marm -mlong-calls` via the BlocksDS `*.arm.c` rule; the suffix, not `ITCM_CODE`, selects ARM mode. A 4 KB register stack (512 cells) lives in DTCM via `DTCM_BSS`, with the dispatch table as `DTCM_DATA`. The DTCM size symbols that `ds_arm9.ld` PROVIDEs (`__dtcm_data_size`, stack sizes) are set so the C stack (~11 KB left) cannot grow into them, and the C-stack high-water mark is reported in `DSD|MEM`. Frames are windowed, up to 64 registers each; call depth is bounded by the stack with a friendly R5xx error.

### 3.4 Repository layout and path ownership

The repo root is `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`, the folder that already holds the planning documents; it stays there (user decision of 2026-09-25, section 2.10). On Day 0 the user makes it a repo in place (section 7.1):
- `git init -b main` and the repo config below;
- the minimal `.gitignore` below, before the first commit;
- `mwccarm\` moved to `vendor\mwccarm\` and `dsd-windows-x86_64.exe` to `vendor\dsd\`, inside the same folder;
- a first commit of `PLAN.md`, `CLAUDE.md`, `docs/` and `.gitignore`, pushed to the private GitHub `origin`.

Local streams work in sibling worktrees `..\DSDude-ws<n>`, cloud streams in clones of `origin` (the Worktrees rule below). `vendor/` is never pushed.

```
C:\Users\zache\OneDrive\Desktop\Projects\DSDude\
  package.json  package-lock.json  tsconfig.json (solution)  tsconfig.base.json  biome.json   [WS0]
  .npmrc                                                                                      [WS0]
  vitest.config.ts  (test.projects: ['packages/*', 'apps/*', 'tools/gen-docs', 'runtime'])    [WS0]
  .gitattributes  .editorconfig  .gitignore  README.md  LICENSE*  PLAN.md  CLAUDE.md          [WS0]
  .githooks/pre-commit  .githooks/commit-msg  .githooks/pre-push  .claude/  .vscode/          [WS0]
  CODEOWNERS  (generated from tools/ownership.json; informational, WS0 merges without PRs)    [WS0]
  contracts/   README.md CHANGELOG.md builtins.json opcodes.json runtime-limits.json
               project-format.md dsdb.md language.md events.md assetpack.md diagnostics.md
               cli.md log-protocol.md ipc.md toolchain-api.md runtime-artifact.md             [per file: see the ownership table]
  docs/        adr/ research/ kickoff/ status/checkpoint-N.md status/cloud.md                 [WS0; new adr/NNNN-*.md: any stream, see notes]
               manual/ tutorial/ (incl. tutorial/assets/) reference/ (generated by gen-docs)  [WS7; manual/setup/, manual/assets/, manual/runtime-build.md: see table]
               qa/                                                                            [WS8]
               status/wsN.md                                                                  [each stream its own file; WS0 appends IF- entries]
  fixtures/    bytecode/ runtime-core/ runtime/ build/ compiler/ conformance/ assets/
               ide/ editors/ language-service/                                                [per-path owners in tools/ownership.json; see section 3.4 ownership table]
  tools/       ownership.json check-ownership.ts checkpoint.ps1 memsampler.ps1 adr-pending.ts
               gen-builtins.ts gen-opcodes.ts gen-dsdb.ts tsconfig.json phase0/
               check-lockfile.mjs postinstall.mjs
               cloud/ (session-start.mjs lib.sh start.sh push.sh)                             [WS0]
               fetch-vendor.ps1 screenshot.py tools-pack.json                                 [WS1, then WS8]
               gen-docs/                                                                      [WS7]
  packages/project-format/    zod schemas, load/save, Diagnostic type, E29x catalog           [WS0]
  packages/dsdb/              DSDB encode/decode/assemble/disassemble (.dsda text form)       [WS4 from the tag; WS2 co-signs]
  packages/lang/  packages/compiler/                                                          [WS4 from the tag]
  packages/asset-pipeline/                                                                    [WS5]
  packages/toolchain/  packages/cli/                                                          [WS1, then WS8]
  packages/ipc-contract/      channel map + zod schemas                                       [WS6 from the tag]
  packages/editor-core/       pure-function editor cores                                      [WS6b]
  packages/language-service/  packages/monaco-dss/ (Monaco glue)                              [WS7]
  apps/ide/                   everything except the two entries below                         [WS6]
  apps/ide/src/renderer/editors/  (sprite, room, background, sound)                           [WS6b]
  apps/ide/electron-builder.yml                                                               [WS8]
  runtime/core/  runtime/host/  runtime/Makefile.host  runtime/tests/  runtime/CLAUDE.md      [WS2]
  runtime/platform/ds/ (incl. CLAUDE.md, WS3's brief)  runtime/selftest/  runtime/data/ (8x8 font)
  runtime/Makefile  runtime/dist/  runtime/package.json (npm workspace: npm run build:runtime)
  runtime/tsconfig.json  runtime/vitest.config.ts  runtime/src/ (TS build:runtime + tests)    [WS3]
  runtime/LICENSE (Zlib)                                                                      [WS0]
  runtime/gen/  (generated by tools/gen-builtins.ts and tools/gen-opcodes.ts)                 [generated: see the table notes]
  samples/hello/                                                                              [WS1, then WS8]
  samples/minimal/  samples/flappy/                                                           [WS4 until M2, then WS7]
  samples/topdown-mini/  samples/touch-paint/  templates/ (incl. index.json, library/)        [WS7]
  scripts/install-toolchain.ps1  scripts/smoke-test.ps1                                       [WS1, then WS8]
  scripts/release.ps1  scripts/ci.ps1  tests/e2e/  .github/  CHANGELOG.md                     [WS8]
  vendor/  (gitignored except README.md, never pushed: mwccarm/, dsd/, tools-pack staging,
           emulator zips)                                                                     [WS0: README.md]
  .dsdude/  (gitignored: this worktree's DSDUDE_HOME; a cloud session uses $HOME/.dsdude)
```

**Path ownership table.** `tools/ownership.json` maps path globs to owners, with `from`/`until` fields that name annotated git tags on main, which only WS0 creates: `phase0`, `toolchain-ok`, `cp-a`, `cp-b`, `cp-c`, `m2` and `start-ws<n>` (tagged just before WS0 tells the user to launch stream n). A row is active when its `from` tag exists (or it has none) and its `until` tag does not; a path matched by no active row is a violation (`docs/kickoff/ws0.md` task 3). The table below is its content and replaces the per-stream path lists; section 6 and the kickoff files point here.

| Owner | Paths |
|---|---|
| **WS0** | `package.json`, `package-lock.json`, `tsconfig.json` (the root solution file), `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `.gitattributes`, `.editorconfig`, `.npmrc`, `.gitignore` (including `!vendor/README.md`), `vendor/README.md`, `README.md`, `LICENSE*`, `runtime/LICENSE`, `PLAN.md`, `CLAUDE.md`, `CODEOWNERS`, `.githooks/**`, `.claude/**`, `.vscode/**`; `tools/ownership.json`, `tools/tsconfig.json`, `tools/gen-builtins.ts`, `tools/gen-opcodes.ts`, `tools/gen-dsdb.ts`, `tools/check-ownership.ts`, `tools/checkpoint.ps1`, `tools/memsampler.ps1`, `tools/adr-pending.ts`, `tools/phase0/**`, `tools/check-lockfile.mjs`, `tools/postinstall.mjs`, `tools/cloud/**`; `docs/adr/**` (new ADR files: see notes), `docs/research/**` (`README.md`, `01-toolchain.md` .. `06-idestack.md`, `07-design-panel-summary.md`, `verification.md`), `docs/kickoff/**`, `docs/status/checkpoint-*.md`, `docs/status/cloud.md` (the cloud-stream registry), the `## Integration feedback` section of every `docs/status/wsN.md` (append rule: see notes); `contracts/README.md`, `contracts/CHANGELOG.md` (append rule: see notes), `contracts/builtins.json` (append-only; WS7's doc/example rule: see notes), `contracts/project-format.md`, `contracts/diagnostics.md`; `packages/project-format/**`; from the tag, `fixtures/runtime-core/flappy-nitrofs/**` (WS0 builds it locally with grit/mmutil for the cloud stream WS2) and `fixtures/assets/golden/**` (WS0 generates it locally with py-desmume for the cloud stream WS5's screenshot check) |
| **WS1, then WS8** | `packages/toolchain/**` (including the E6xx catalog `src/diagnostics/catalog.ts`), `packages/cli/**`, `tools/fetch-vendor.ps1`, `tools/screenshot.py`, `tools/tools-pack.json`, `scripts/install-toolchain.ps1`, `scripts/smoke-test.ps1`, `samples/hello/**`, `fixtures/runtime/hello/**`, `fixtures/build/**`, `contracts/toolchain-api.md`, `contracts/cli.md`, `docs/manual/setup/**` |
| **WS8** (in addition) | `tests/e2e/**`, `.github/**`, `apps/ide/electron-builder.yml`, `scripts/release.ps1`, `scripts/ci.ps1`, `CHANGELOG.md`, `docs/qa/**` |
| **WS2** | `runtime/core/**` (including the R5xx catalog `runtime/core/diagnostics/catalog.json`), `runtime/host/**`, `runtime/Makefile.host`, `runtime/tests/**`, `runtime/CLAUDE.md`, `fixtures/bytecode/**`, `fixtures/runtime-core/**` except `fixtures/runtime-core/flappy-nitrofs/**` (WS0), `fixtures/conformance/expected/**`, `contracts/log-protocol.md`, `contracts/runtime-limits.json`; `contracts/dsdb.md` co-owned with WS4 |
| **WS3** | `runtime/platform/ds/**` (including `runtime/platform/ds/CLAUDE.md`, WS3's brief), `runtime/selftest/**`, `runtime/data/**` (the 8x8 font), `runtime/Makefile`, `runtime/package.json`, `runtime/tsconfig.json`, `runtime/vitest.config.ts`, `runtime/src/**` (the TypeScript `build:runtime` script and its tests; not the C sources), `runtime/dist/**`, `fixtures/runtime/**` except `hello/` (including the selftest GRFs/soundbank WS3 makes itself with the installed grit/mmutil), `contracts/runtime-artifact.md`, `docs/manual/runtime-build.md` |
| **WS4** (from the tag) | `packages/lang/**`, `packages/compiler/**` (including `src/diagnostics/catalog.ts`), `packages/dsdb/**` (WS2 co-signs changes), `contracts/opcodes.json`, `contracts/language.md`, `contracts/events.md` (WS2 co-signs), `contracts/dsdb.md` (co-owned with WS2), `fixtures/compiler/**`, `fixtures/conformance/**` except `fixtures/conformance/expected/**`, `samples/minimal/**` and `samples/flappy/**` until M2 (then WS7) |
| **WS5** | `packages/asset-pipeline/**` (including `src/diagnostics/catalog.ts`), `fixtures/assets/**` except `fixtures/assets/golden/**` (WS0), `contracts/assetpack.md`, `docs/manual/assets/**` |
| **WS6** | `apps/ide/**` except `src/renderer/editors/**` and `electron-builder.yml`; `packages/ipc-contract/**` (from the tag); `contracts/ipc.md`; `fixtures/ide/**` (including mock-host) |
| **WS6b** | `apps/ide/src/renderer/editors/**`, `packages/editor-core/**`, `fixtures/editors/**` |
| **WS7** | `packages/language-service/**`; `packages/monaco-dss/**` (the Monaco glue, moved out of `apps/ide` into its own workspace package with its own `package.json`); `tools/gen-docs/**`; `docs/reference/**` (gen-docs is the only docs generator; gen-builtins no longer emits `functions.md`); `docs/manual/**` except `setup/`, `assets/` and `runtime-build.md`; `docs/tutorial/**` (including the tutorial assets in `docs/tutorial/assets/`); `samples/topdown-mini/**`, `samples/touch-paint/**`; `templates/**` (including `templates/index.json` and the CC0 sound library in `templates/library/`); `fixtures/language-service/**`; the `doc`/`example` fields of `contracts/builtins.json` (see notes) |
| **Every stream** | its own `docs/status/wsN.md`, above its closing `## Integration feedback` section |

Notes on the table:
- **Before `git tag phase0`,** WS0 may write anywhere except WS1's entries, where it writes only the `packages/toolchain` and `packages/cli` skeletons, `packages/toolchain/src/api.ts` + `MockBuildService` and the `contracts/cli.md` draft. Elsewhere that includes the other package skeletons and their `CLAUDE.md`, `packages/asset-pipeline/src/preview.ts`, and the seed fixtures and samples. WS1, from hour zero, writes only its own entries. All other stream entries take effect at the tag.
- **WS1 to WS8.** The entry changes hands at the `start-ws8` tag, which WS0 creates when WS8 takes over slot 1: at CP-C in hybrid mode (as in upgraded mode), or after WS3 in the standard-mode fallback (section 7.2). This is the one exception to section 6's rule that a handed-off stream fixes its own paths in short sessions: in the standard-mode fallback, between WS1's hand-off to WS3 and WS8's start, fixes to these paths and toolchain ADRs go through WS0. `docs/kickoff/ws8.md` lists WS1's leftovers (tools pack, `dsdude doctor`, DeSmuME-profile polish, and wiring `compileProject`/`packAssets` into `BuildService` for whichever has not landed by the hand-off).
- **Shared-file rules** (encoded in `tools/ownership.json` and checked by both `tools/check-ownership.ts` and the integration run):
  - `contracts/CHANGELOG.md`: the owner of any contract file may append entries for its own contracts, and WS7 may append T0 entries under the C2 `builtins.json` section for its doc/example fills. The check rejects a diff that changes or deletes existing lines.
  - `docs/adr/NNNN-*.md`: any stream may create a new ADR file, never modify an existing one. WS0 numbers, edits and closes ADRs.
  - `contracts/builtins.json`: WS7 may change only the `doc` and `example` fields of existing entries (the `TODO(WS7)` text). The check does a field-level JSON diff. New entries and every other field stay WS0's.
  - `docs/status/wsN.md`, section `## Integration feedback` (the last section of every status file): only WS0 writes it, by appending lines at the end of the file on `main`. Each failure that only a local run finds in a stream's work (real grit/mmutil, MSYS2 gcc, the DS build of the core, emulators, Electron) gets an entry there and a line in `docs/status/checkpoint-N.md`: ``- IF-<k> <date> checkpoint-<N> @<sha>: <check> failed: `<command>` -> <first error lines or file:line>. Action: <what to do>.`` WS0 closes an entry by appending `- IF-<k> resolved by <sha>`. The check rejects a WS0 diff that changes or deletes lines in the section, and a stream diff that touches the heading or anything below it. The stream fixes open entries first and keeps its own text above the heading, so both sides merge cleanly.
- **Packaged content.** WS8's `apps/ide/electron-builder.yml` copies `templates/**` (with `templates/library/`), `docs/tutorial/**` (with `docs/tutorial/assets/`), `docs/manual/**` and `docs/reference/**` into `extraResources`. The IDE (WS6) reads them from the repo in development and from `resources/` when packaged: the New Project wizard lists `templates/index.json`, 'Add from library' lists `templates/library/`, and Help > Tutorial assets opens `docs/tutorial/assets/`.
- **WS6b.** WS6b is an optional cloud stream from CP-B that runs only if usage limits allow; the standard-mode fallback folds it into WS6. When WS6b does not run, WS6 holds its entries. The object editor is WS6's (section 6 WS6); `editors/` holds the sprite, room and background editors and the sound panel.
- **Co-signing.** "WS2 co-signs" means WS2 approves the change in its ADR or at the daily integration. Only the listed owner commits, except `contracts/dsdb.md`, which either stream may commit.
- **Generated paths** (`runtime/gen/**`, `packages/*/src/gen/**`, `docs/reference/**`, and `fixtures/**/*.dsdb`, whose generator is `tools/gen-dsdb.ts` with inputs the sibling `.dsda`, `contracts/builtins.json` and `contracts/opcodes.json`) may be touched by any commit that changes the generator's input in the same commit.
- **Dependencies.** Phase 0 pre-installs monaco-editor, pixi.js, dockview-react and the rest of the pinned stack into `apps/ide/package.json` and the other packages, so no stream needs to edit another stream's `package.json`.

**Rules.**
- Each package owns its `package.json`, `tsconfig.json`, `vitest.config.ts` and `CLAUDE.md`; only WS0 edits root config. Cross-package imports go through `src/index.ts` (or a declared subpath such as `@dsdude/project-format/node`). Exception: in `runtime/`, WS3 owns `package.json`, `tsconfig.json` and `vitest.config.ts` (its brief is `runtime/platform/ds/CLAUDE.md`), and WS2 owns `runtime/CLAUDE.md`.
- Every workspace package under `tools/` is listed in the root `test.projects` by name (today only `tools/gen-docs`), because `tools/` also holds plain scripts that a `tools/*` glob would match. WS0 adds new ones.
- **Lockfile.** WS0 generates `package-lock.json` on Windows and the cloud clones install from it on Linux. Verified 2026-09-25 (npm 11.13, Node 24.16, Linux simulated with `--os/--cpu/--libc`): a clean Windows lockfile records the linux-x64 glibc variant of every native family (rollup, esbuild, biome, TS 7, tailwind oxide, lightningcss, `@napi-rs/lzma`), and the simulated Linux install landed all of them.
  - Phase 0 pre-installs the whole pinned stack (section 2.5) into the right packages. A stream that still needs a dependency runs `npm install <pkg>@<exact> -w <own package>` and commits only that `package.json`, never `package-lock.json`. `.githooks/commit-msg`, which unlike pre-commit can see the message, rejects a staged `package-lock.json` in any commit other than WS0's regeneration commit.
  - Only WS0 regenerates the lockfile, on Windows, with `npm install` while the lockfile exists: at the daily integration, committed as `chore(deps): regenerate lockfile`.
  - Never delete the lockfile while any `node_modules` exists: that silently drops the 11 `@tailwindcss/oxide-*` entries, Tailwind then fails on Linux, and `npm install` does not repair it. A full rebuild is `Remove-Item -Recurse -Force node_modules, apps\*\node_modules, packages\*\node_modules, tools\*\node_modules, runtime\node_modules, package-lock.json -ErrorAction SilentlyContinue; npm install`.
  - The guard `tools/check-lockfile.mjs` fails when an `optionalDependencies` entry has no lock entry. It runs in commit-msg (lockfile staged), in `tools/checkpoint.ps1` before `main` is pushed, and in `tools/cloud/start.sh` and `push.sh`.
  - Worktrees and cloud clones use `npm install`, never `npm ci` (denied in `.claude/settings.json`), and run `git restore package-lock.json` after every install and before every merge of `main` (`origin/main` in the cloud), because `npm install` may rewrite it.
  - If the guard fails in a cloud session, the stream leaves the lockfile alone, writes `BLOCKER lockfile` in its status file, pushes, tells the user, and meanwhile installs the missing binary with `npm install --no-save <missing>@<version>`, never `--force`.
  - The root `postinstall` is `node tools/postinstall.mjs`. It runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1`, which the cloud environments set.
  - `.npmrc` sets `save-exact=true`, `fund=false`, `audit=false`.
- **Enforcement.**
  - `.githooks/pre-commit` runs Biome (format and lint) and `tools/check-ownership.ts`. The check identifies the stream from `git config --worktree dsdude.ws` and reads `tools/ownership.json` from `main`, or from `origin/main` in a cloud session (`CLAUDE_CODE_REMOTE=true`) and wherever there is no local `main`.
  - `.githooks/commit-msg` adds the `DSDude-WS: WSn` trailer with `git interpret-trailers --in-place --if-exists doNothing --trailer "DSDude-WS: WSn"`.
  - Both hooks exit 0 without checks when `git rev-parse -q --verify MERGE_HEAD` succeeds (a merge commit), matching the integration's `--no-merges` rule; commit-msg still adds the trailer first. Merges carry main's regenerated lockfile and other streams' files.
  - `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`) or any `mwccarm/`, `license.dat` or `dsd-*.exe` path. It checks the whole pushed history (`git log --name-only` over the pushed range), not just the tip tree, so a file committed and later untracked is still caught (`docs/kickoff/ws0.md` task 3).
  - The hooks are a convenience. The enforcement point is WS0's integration. For each non-merge commit in `main..<ref>`, it checks the commit's files against `tools/ownership.json` at main's HEAD for the stream in the commit's `DSDude-WS:` trailer, and refuses the merge on violations (section 2.10). `<ref>` is `wsN-<name>` for a local stream and `origin/<push target>` from `docs/status/cloud.md` for a cloud stream; a commit without a trailer is checked for the branch's or the registry's stream. Commits that came in through an allowed `ws2-*`/`ws4-*` cross-merge are checked against their own author stream.
- **Worktrees and cloud clones.** Hybrid mode (section 7.2) runs WS0, WS1, WS3, WS6 and WS8 locally and WS2, WS4, WS5, WS7 and the optional WS6b as cloud sessions.
  - **Local:** WS0 works on `main` in the repo root; every other local instance gets one git worktree and branch in a sibling folder, for example `git worktree add ..\DSDude-ws3 -b ws3-platform`, then `git config --worktree dsdude.ws WS3` inside it. The stream's `docs/kickoff/wsN.md` sets its `DSDUDE_HOME` to `<worktree>\.dsdude` (for example `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3\.dsdude`). The root path is 47 characters and a worktree path 51-52, so `core.longpaths true` stays and every build path stays under 250 characters (section 6 WS1).
  - **Cloud:** no worktree. Each session clones `origin` and works on `wsN-<name>`, which WS0 branches from the `start-wsN` tag and pushes before the launch. Repo config is not cloned, so the session's first command is `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn` (the SessionStart hook `tools/cloud/session-start.mjs` runs the same when the environment sets `DSDUDE_WS`). A fresh clone has no `extensions.worktreeConfig`, so `git config --worktree dsdude.ws` reads that local value. `DSDUDE_HOME` is `$HOME/.dsdude`. The session pushes only with `bash tools/cloud/push.sh`; if `wsN-<name>` is refused, push.sh falls back to `claude/wsN-<name>` or the session's own branch, the stream records the new target in its status file (`Cloud push target:`), and WS0 records it in `docs/status/cloud.md`. The procedure is in section 7.5 and `docs/kickoff/README.md` section 8.
  - **Fallback:** when WS0 records the switch to standard mode, or after a RAM upgrade (section 7.2), a cloud stream continues locally with `git fetch origin; git worktree add -B wsN-<name> ..\DSDude-wsN origin/<push target>` and the local rules above.

**Line endings and git config** (Day 0 and Phase 0 day 1):
- `.gitattributes`: `* text=auto eol=lf`; `text eol=lf` for `*.sh`, `.githooks/*`, `Makefile*` and `*.mk`; `text eol=crlf` for `*.ps1` and `*.cmd`; `binary` for `*.dsdb *.grf *.bin *.nds *.elf *.png *.wav *.xm *.mod *.it *.s3m *.sav *.zip` (one pattern per line).
- `.githooks/*` and `tools/cloud/*.sh` are added with `git add --chmod=+x`: Git on Windows records no executable bit by default, and a Linux clone ignores a hook without one.
- `.editorconfig`: `end_of_line = lf`.
- `biome.json`: `formatter.lineEnding: "lf"`.
- `.gitignore`, Day 0 (written by the user before the first commit, so `mwccarm` never reaches GitHub): `vendor/*`, `!vendor/README.md`, `/mwccarm/`, `/dsd-windows-x86_64.exe`, `.claude/settings.local.json`, `node_modules/`, `.dsdude/`, `/dist/`, `/build/`, `*.nds`, `*.elf`, `!/fixtures/**/*.nds`, `!/fixtures/**/*.elf`, `!/runtime/dist/*.elf`. `/dist/` and `/build/` are root-anchored because `runtime/dist/**` and `fixtures/build/**` are tracked. The root-level `/mwccarm/` and `/dsd-windows-x86_64.exe` lines are a second line of defence in case moving the vendor binaries into `vendor/` fails on Day 0. `.claude/settings.local.json` holds each instance's own "don't ask again" answers; the user's global excludes line `**/.claude\settings.local.json` does not match it, because git reads the backslash as an escape.
- `.gitignore`, Day 1 (WS0 replaces the Day-0 file): `node_modules/`, `dist-types/`, `*.tsbuildinfo`, `coverage/`, `test-results/`, `playwright-report/`, `__pycache__/`, `.dsdude/`, `.claude/settings.local.json`, `/samples/*/build/`, `/samples/*/*.nds`, `/samples/*/*.elf` (BlocksDS Makefile output), `/runtime/build/`, `/runtime/build-host/` (WS2's `Makefile.host` output on both compilers), `/apps/ide/out/`, `/apps/ide/dist/`, `vendor/*` with `!vendor/README.md`, `/mwccarm/` and `/dsd-windows-x86_64.exe`, plus the Day-0 lines `/dist/`, `/build/`, `*.nds`, `*.elf` and their three `!` exceptions. `runtime/dist/**` and `fixtures/**` stay tracked, and `vendor/*` stays ignored in every later version.
- `.ps1` files are ASCII-only (or UTF-8 with BOM): Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI, and an em dash inside a double-quoted string then breaks parsing.
- Repo config, set by the user on Day 0 in the repo root (section 7.1) and shared by all local worktrees: `core.autocrlf false` (this machine has system-level `core.autocrlf=true`, verified), `core.longpaths true`, `extensions.worktreeConfig true`, `core.hooksPath .githooks`. Cloud clones set their own (the Worktrees rule above).
- Every golden and trace writer opens files in binary mode (`"wb"` in C, Buffers in Node), and trace comparisons strip `\r`.
- A Phase-0 test commits from a fresh worktree and asserts that pre-commit and commit-msg ran, that a merge bringing a regenerated lockfile and another stream's files passes, that Makefiles and hooks check out with LF, and that `pre-push` refuses a pushed history with a file under `vendor/`, including one committed and then untracked again (pushed to a local bare repo). The Day-1 cloud probe repeats the trailer check in a Linux clone.

## 4. The language: DSS

*This section summarises contract C6. `contracts/language.md` (grammar and semantics) and `contracts/events.md` (event files, frame order, inheritance) are normative. WS0 writes v0.1 of both before `git tag phase0` (section 7.1).*

**Lexical and statements.** `//` and `/* */` comments; identifiers; decimal and hex numbers, `1.5`; `"strings"` with `\n \" \\`; `true false undefined`. Statements: `var a = 1, b;`, `if/else`, `while`, `for`, `repeat (n)`, `do { } until (c);`, `switch/case/default`, `break`, `continue`, `return`, `exit`, `with (target) { }`, blocks, `function name(a, b = 1) { }` (in `scripts/*.dss` = global; in `objects/<obj>/functions.dss` = object-scoped, callable from that object's events and children). Expressions: literals, `global.x`, `inst.x`, `obj.x` (read = first instance, write = all, exactly GML), `arr[i][j]`, calls, unary `- !`, `+ - * / div mod %`, comparisons, `&& ||`, `?:`, assignments `= += -= *= /=`, `++ --`, string `+` (string + number is E3xx when provable, R5xx otherwise: *"use string(n)"*). `=` inside a condition compiles as `==` with warning W030. Truthiness: `false`, `0`, `undefined` are false.

**Semicolons are optional**, as in GML: a statement ends where the next token cannot continue it. The formatter inserts semicolons, and the parser resynchronises on `;`, statement keywords, `}` and newlines. W032 warns when a line starting with `(` or `[` continues the previous line's expression.

**Types:** number (int32 or Q20.12, promoted automatically; the rules for `/`, `div`, `mod`, rounding, comparison and `string(n)` formatting are in section 2.8), string (immutable, ref-counted), bool, undefined, array (0-based, grows on assignment, nested allowed, by reference), instance id, asset id (sprite/object/room/sound/background names are identifiers).

**Scopes:** `var` locals live in registers and die at event end; instance variables exist on first assignment and get compile-time slots per object (parent layout first, then the union of names assigned anywhere in the object's events; unknown names on `other` fall into a lazily allocated 8-entry overflow map, see rule 1 below); `global.name` uses global slots; `self/other/all/noone`.

**Semantics pinned before the `phase0` tag.** These rules go into `contracts/language.md`, `contracts/events.md` and, for rule 1, `contracts/dsdb.md`, so that WS2 and WS4 implement them the same way. Each rule gets one conformance fixture, in the conformance tier that exercises it (section 6, WS2/WS4).

1. **Dynamic slots.** DSDB OBJS carries, per object, a sorted (symbolId, slot) table, the parent id and an ancestor bitset. `inst.var` on a runtime id and GETDYN/SETDYN binary-search that table, then fall back to the 8-entry overflow map. Reading a slot that was never assigned raises R50x *"x was never given a value in obj_y"*.
2. **Event inheritance.** A child without an event file runs the parent's. `event_inherited()` calls the parent's version. `collision_<parent>`, `with`, `instance_*` and `place_meeting` on a parent include its descendants.
3. **`with`.** It iterates a snapshot of ids in creation order, skips instances destroyed mid-loop, sets `other` to the outer `self`, and can nest; `break`/`continue`/`exit`/`return` unwind through WITHEND.
4. **User events.** `event_user(n)` is a builtin that runs the instance's `user_<n>.dss` (`user_0..7`).
5. **Variadic builtins.** `choose`, `min` and `max` declare `minArgs`/`maxArgs` in `builtins.json`.
6. **Printing any value.** `show_debug_message` and `draw_text` accept any value, formatting numbers as `string()` does.
7. **Globals.** `global.*` persists across `room_goto`/`room_restart` and is cleared only by `game_restart`.
8. **Music.** `audio_play_music(m)` is a no-op if `m` is already playing; to restart it, call `audio_stop_music()` first.

Three smaller rules are in section 5 C6 ("Small language rules"): a W lint for non-ASCII text passed to `draw_text`, the xorshift32 PRNG seeding (with `randomize()` kept as a no-op), and fixed-point array indices flooring with W04x.

**Events (per-event files under `objects/<name>/`):** `create.dss`, `destroy.dss`, `begin_step.dss`, `step.dss`, `end_step.dss`, `alarm_0.dss` .. `alarm_7.dss`, `draw.dss`, `collision_<object>.dss`, `button_pressed_<btn>.dss` / `button_released_<btn>.dss` / `button_held_<btn>.dss` (`a b x y l r start select up down left right`), `touch_pressed.dss` / `touch_released.dss` / `touch_held.dss` (stylus on this instance's bbox; bottom-screen instances only), `global_touch_pressed.dss` / `global_touch_released.dss` / `global_touch_held.dss` (anywhere on the touch screen), `game_start.dss` / `game_end.dss`, `room_start.dss`, `room_end.dss`, `animation_end.dss`, `outside_room.dss`, `user_0.dss` .. `user_7.dss`.

- **Frame order (contract C6):** input → Begin Step → Alarms → Button/Touch/Global Touch → Step → built-in motion (`hspeed/vspeed/gravity/friction` in one native loop) → collisions → End Step → animation → Outside Room → Draw (default `draw_self`) → VBlank commit.
- **Room load order:** the room's instances run Create → Game Start (only for the first room; it fires once per game, and `game_restart` fires it again) → Room Start. Game End fires on `game_end()`. `room_goto`/`room_restart` take effect at the end of the frame (section 3.2).
- **Outside Room** (pinned in `contracts/events.md`): fires once when an instance whose bbox has been inside or overlapping the room rectangle becomes fully outside it. An instance created outside the room does not fire until it has entered the room and left again.

**Built-in instance variables:** `id object_index x y xprevious yprevious xstart ystart speed direction hspeed vspeed gravity gravity_direction friction sprite_index sprite_width sprite_height image_index image_number image_speed image_xscale image_yscale image_angle visible depth screen alarm[0..7] bbox_left bbox_right bbox_top bbox_bottom`. Globals: `room room_width room_height room_speed (60) view_x[screen] view_y[screen] touch_x touch_y`. Constants: `btn_*`, `SCREEN_TOP`, `SCREEN_BOTTOM`, `self other all noone`.

**Builtins (~90, all in `contracts/builtins.json` with `allowedEvents` and `pure` flags, plus `minArgs`/`maxArgs` for variadic ones):** instances `instance_create instance_destroy instance_exists instance_number instance_find instance_nearest instance_place place_meeting position_meeting place_free collision_rectangle collision_point`; events `event_inherited event_user`; motion `motion_add motion_set move_towards_point move_wrap point_distance point_direction lengthdir_x lengthdir_y distance_to_object`; input `button_check button_pressed button_released touch_check touch_pressed touch_released` (these three read the stylus anywhere on the touch screen and are legal in objects on either screen) and `touch_in_instance`; drawing (Draw events only, enforced by the checker) `draw_self draw_sprite draw_sprite_ext draw_text draw_set_screen draw_set_color draw_rectangle draw_clear`; rooms/game `room_goto room_goto_next room_goto_previous room_restart game_restart game_end`; audio `audio_play_sound audio_stop_sound audio_play_music audio_stop_music audio_set_volume audio_is_playing`; math `floor ceil round abs sign frac sqrt min max clamp lerp random random_range irandom irandom_range choose randomize dsin dcos`; strings `string real string_length string_char_at string_upper string_lower string_repeat chr ord`; arrays `array_length array_push array_pop array_create array_delete`; debug `show_debug_message assert`.

**Sample: Flappy Bird's bird** (each block is one file; this listing is also the tutorial's first code and `samples/flappy` is a compiler fixture from week 1):

```js
// objects/obj_bird/create.dss  -- runs once when the bird is created
image_speed  = 0.2;          // wing animation: 0.2 frames per step
gravity      = 0.25;         // built-in: added to vspeed every step by the engine
flap_power   = -4.5;         // instance variable, created on first assignment
alive        = true;
global.score = 0;

// objects/obj_bird/step.dss  -- runs every frame (60 per second)
if (!alive) exit;
if (button_pressed(btn_a) || touch_pressed()) {   // A button, or a tap on the bottom screen
    vspeed = flap_power;
    audio_play_sound(snd_flap);
}
if (vspeed > 6) vspeed = 6;                       // terminal velocity
image_angle = clamp(-vspeed * 8, -30, 60);        // tilt the bird's nose up or down
if (y < 0) { y = 0; vspeed = 0; }
if (y > room_height - sprite_height) die();

// objects/obj_bird/collision_obj_pipe.dss  -- bbox overlap with any obj_pipe
if (alive) die();

// objects/obj_bird/collision_obj_gap.dss   -- invisible score trigger between pipes
if (alive && !other.scored) { other.scored = true; global.score += 1; audio_play_sound(snd_point); }

// objects/obj_bird/alarm_0.dss
room_restart();

// objects/obj_bird/functions.dss  -- helpers visible to this object's events
function die() {
    alive = false;
    image_speed = 0;
    audio_play_sound(snd_hit);
    with (obj_pipe) hspeed = 0;
    show_debug_message("Score: " + string(global.score));   // -> Output panel
    alarm[0] = 60;                                           // restart in one second
}
```

`obj_pipe` needs only `create.dss` (`hspeed = -2;`) and `outside_room.dss` (`instance_destroy();`). `obj_gap` (Visible off, with sprite `spr_gap` from the tutorial's `gap.png` so it has a bbox) has the same two files, with `hspeed = -2; scored = false;` in `create.dss`; without `scored = false`, the bird's first read of `other.scored` would stop the game with R50x (rule 1). `obj_ctrl` (no sprite, Visible off) starts the timer in `create.dss` with `alarm[0] = 60;` and spawns both in `alarm_0.dss` with `var gy = irandom_range(48, 144); instance_create(272, gy, obj_pipe); instance_create(272, gy, obj_gap); alarm[0] = 90;`. One 64-px pipe at the gap's height does not yet make an upper and a lower pipe; WS0 files `docs/adr/0001-flappy-pipe-geometry.md` in Phase 0 with a recommended two-pipe fix for the user to decide. (Accepted 2026-09-25: `obj_ctrl` spawns pipes at `gy - 152` and `gy + 24`, and `obj_pipe` sets `image_yscale = 2`; `samples/flappy` carries it.) `rm_game` is 256x192, one screen wide, so pipes spawn just right of the room, scroll in, and fire Outside Room once when they leave on the left. `obj_hud` on the top screen draws the score in `draw.dss` with `draw_text(112, 16, string(global.score));`. The sounds `snd_flap`, `snd_point` and `snd_hit` come from the tutorial assets (section 6 WS7).

**Deliberate omissions** are listed in section 1 and repeated in `contracts/language.md` and the manual's "Differences from GameMaker" chapter. That chapter opens with the GameMaker-to-DS concept mapping: Sprite → PNG up to 64x64 in 16/256 colours, Background → 8x8 tiles up to 512x512, Object → a thing that lives on one of two screens, Room → both screens with a view each, `real` → int32/Q20.12 ("very tiny fractions round a little"), limits → meters. Without `persistent`, once-per-game setup such as a high score goes in `game_start.dss` and lives in `global.*` (rule 7). Known GameMaker names that DSS lacks get a dedicated E2xx message rather than a did-you-mean, and a few are aliases (section 5 C2).

## 5. Contracts

All contracts live under `contracts/` (specs) or in the named package, and each carries a `version` header and a "how to change me" section (formats in `docs/kickoff/ws0.md` task 4; every Phase-0 contract starts at 0.1.0). `tools/ownership.json` (section 3.4) assigns every contract file to one owner, and a stream edits only the contract files assigned to it. Changes follow the tiers of section 7.4:
- **T0** (doc or example text, comments): the owner commits directly with a CHANGELOG line.
- **T1** (additive: an appended builtin, a new opcode, an optional IPC field, a new limit key): the owner commits with a minor version bump, regenerated outputs and a `contracts/CHANGELOG.md` entry. WS0 reviews it within 24 hours at the daily integration.
- Owners append their CHANGELOG entries themselves under the shared-file rule of section 3.4.
- **T2** (breaking): ADR, co-signed by every affected owner, merged by WS0.

In weeks 1-4, WS0 merges C2, C6 and C11 changes within 24 hours rather than at checkpoints. Their owners WS2 and WS4 are cloud streams, so WS0 takes these changes from the push targets registered in `docs/status/cloud.md` at its daily fetch (section 7.2). Consumers pin to the version in `contracts/CHANGELOG.md`.

Generated files (`runtime/gen/**`, `packages/*/src/gen/**`, `docs/reference/**`, `fixtures/**/*.dsdb`) come only from `tools/gen-builtins.ts`, `tools/gen-opcodes.ts`, `tools/gen-dsdb.ts` and `tools/gen-docs/`. A commit that changes a generator's input regenerates its outputs in the same commit, whoever owns the tree they land in, and a CI check keeps them byte-identical. Cloud streams regenerate on Linux (for example `node tools/gen-dsdb.ts` in WS4) and WS0 checks the same outputs on Windows, so the generators write LF endings and `/` separators and sort by code point, never by locale: the same inputs give the same bytes on both.

### 5.1 Contract index, owners and freeze points

Phase 0 is minimum-viable (section 7.1). WS0 writes only what the first streams need; the owning stream writes the rest.

| Id | Contract | Lives in | Owner after the `phase0` tag | Written → frozen | Consumers |
|---|---|---|---|---|---|
| C1 | Project format | `packages/project-format`, `contracts/project-format.md` | WS0 | WS0, Phase 0 day 1 → tag | all |
| C2 | DSDB bytecode, opcodes, builtins | `contracts/dsdb.md`, `contracts/opcodes.json`, `contracts/builtins.json`, `packages/dsdb` | `packages/dsdb` and `opcodes.json`: WS4, WS2 co-signs; `dsdb.md`: WS2 and WS4; `builtins.json`: WS0, append-only | WS0, Phase 0 day 2 → container and stable opcodes at the tag; provisional opcodes and new builtins by T1 | WS2, WS3, WS4, WS7 |
| C3 | Asset pack layout + manifest | `contracts/assetpack.md` | WS5 | WS5 on its first day, from section 2.9 → T1 afterwards | WS2, WS3, WS4, WS6 |
| C4 | Toolchain driver API + BuildService | `packages/toolchain/src/api.ts`, `packages/toolchain/src/index.ts`, `contracts/toolchain-api.md` | WS1 | types + `MockBuildService`: WS0, Phase 0 day 1 → `BuildService` confirmed by WS1 at CP-A | WS4 and WS5 (implement `CompileFn`, `PackAssetsFn`, `CheckRoomBudgetsFn`), WS6, WS8 |
| C5 | IPC channel map | `packages/ipc-contract`, `contracts/ipc.md` | WS6 | channel list + zod stubs: WS0, Phase 0 day 1 → full contract by WS6 | WS1, WS6b, WS7, WS8 |
| C6 | Language spec, events, conformance corpus | `contracts/language.md`, `contracts/events.md`, `fixtures/conformance/` | WS4 (`events.md` co-signed by WS2; `fixtures/conformance/expected/**` owned by WS2) | v0.1: WS0, Phase 0 day 2 → tag | WS2, WS6b, WS7 |
| C7 | Language-service host API | `packages/lang/src/host.ts` | WS4 | WS4 → CP-B | WS7 |
| C8 | Runtime log protocol + runtime artifact | `contracts/log-protocol.md`, `contracts/runtime-artifact.md` | WS2 (protocol), WS3 (artifact) | protocol: WS0, Phase 0 day 1 → tag; artifact: WS3 with its first `runtime/dist` build | WS1, WS6, WS8 |
| C9 | Diagnostics | `contracts/diagnostics.md` | WS0 (shape); each producer owns its code range and catalog | WS0, Phase 0 day 1 → tag | WS1, WS2, WS4, WS5, WS6, WS7 |
| C10 | CLI | `contracts/cli.md`, `packages/cli` | WS1 | draft: WS0, Phase 0 day 1 → final by WS1 | WS8, all streams for smoke tests |
| C11 | Platform seam `dsd_platform.h` | `runtime/core/include/dsd_platform.h` | WS2 | WS2 → CP-A | WS3 |
| C12 | EditorPanel host API + asset preview API | `apps/ide/src/renderer/panels/api.ts`, `packages/asset-pipeline/src/preview.ts` | WS6 (panel API), WS5 (preview) | preview types: WS0, Phase 0; panel API + `fixtures/ide/mock-host`: WS6 → CP-A; preview API: WS5 → CP-B | WS6b, WS7 |
| C13 | `runtime-limits.json` | `contracts/runtime-limits.json` | WS2 (seeded by WS0) | WS0, Phase 0 day 1 → tag; values change by T1 | WS3, WS4, WS5, WS6, WS6b, WS7 |
| C14 | Phase-0 fixtures | `fixtures/`, `samples/` | per path in `tools/ownership.json` | WS0 subset in Phase 0; the rest from the producing streams | all |

The checkpoint dates are hybrid mode's, which keeps upgraded mode's checkpoints (CP-A D+3, CP-B D+7, CP-C D+14; section 7.2). In hybrid mode every owner has started by its freeze point:
- WS1 (local) at hour zero;
- WS2 and WS4 (cloud) and WS6 (local) at the tag;
- WS3 (local) at `toolchain-ok`;
- WS5 and WS7 (cloud) at CP-A;
- WS6b (cloud, optional) at CP-B.

A cloud owner commits its contract files on its stream line like any other owned path, and WS0 merges them from its registered push target. WS7 starts before C7 freezes at CP-B and uses builtins-only completion until then. An owner starts late only when usage limits stagger the cloud streams (WS5 and WS7 wait for a free cloud slot) or under the standard-mode fallback, where several owners start after CP-A or CP-B (section 7.2). Until a late owner starts, WS0 holds its contract files and merges T1 changes to them. The contract then freezes when its owner delivers it, under the late-start freeze rule of section 7.3. A consumer that starts earlier works against the Phase-0 types and mocks (`MockBuildService`, the preview types, the ipc-contract stubs) until then.

### 5.2 Contract definitions

**C1 Project format.**
- `project.json`: `formatVersion`, name, title, subtitle, author, gamecode fixed to `####` in 0.1 (melonDS classifies a two-ELF ROM with its ARM9 at 0x4000 as homebrew by this code; the field is hidden in Game Settings), icon (any PNG; the pipeline quantises it to 32x32 with <= 15 colours + transparent, which ndstool `-b` requires), firstRoom, rooms order. See docs/research/verification.md claim 3.
- `sprites/<n>/sprite.json` + `sheet.png` (horizontal strip; frames, frameWidth/Height, origin, bbox, colorMode auto/16/256, transparent).
- `backgrounds/<n>/background.json` + png.
- `sounds/<n>/sound.json` + source file: wav or mp3 for effects, xm/mod/it/s3m for music (mp3 as music is E4xx, section 2.9).
- `objects/<n>/object.json` (sprite, parent, visible, depth, screen) + per-event `.dss` + `functions.dss`.
- `rooms/<n>/room.json` (width, height, `layout`, screens.top/bottom {background, viewX, viewY}, instances [{object, x, y, screen?, creationCode?}]).
- `scripts/*.dss`.
- zod schemas and load/save. `load(fs, dir)` and `save(fs, dir, project)` take an injected `ProjectFs {readFile, writeFile, readDir, exists}`, so `src/index.ts` stays browser-safe for the Web Worker consumers; the Node adapter is the `@dsdude/project-format/node` subpath. The package also holds the TypeScript form of C9's `Diagnostic`. WS0 adds migrations when the first format change after v0 needs one.

Defaults:
- `sprite.json`: origin = frame centre for new imports; bbox = the opaque bounds; the frame count is editable in the import dialog, with an animated preview; an image whose size is exactly one OBJ size imports as one frame.
- `room.json`: `layout: "separate"` is the only 0.1 value; `"stacked"` is reserved for v1.1.

**C2 DSDB bytecode, opcodes and builtins table.**
- Header: magic `DSDB`, u16 major/minor, u32 ABI hash (FNV-1a 32 over canonical lines of the function, variable and constant entries of `builtins.json`: ids, names, kinds, signatures, scope and value, byte form in `contracts/dsdb.md`; doc/example edits and alias/unsupported entries do not change it), the build's fixed RNG seed (`--seed N`; 0 = use `dsd_plat_rng_seed()`; a non-zero header seed always wins, see C11), and a section table STRS/SYMS/CODE/FUNC/OBJS/ROOMS/ASSETS/GLOB/DBG.
- OBJS carries, per object, a sorted (symbolId, slot) table, the parent id and an ancestor bitset (section 4, dynamic slots). ROOMS carries each room's per-screen asset set (C3).
- Instructions are 32-bit words, `op:8 A:8 B:8 C:8` or `op:8 A:8 Bx:16`. About 70 opcodes: MOV, LOADK/LOADI/LOADB/LOADUNDEF, ADD/SUB/MUL/DIV/IDIV/MOD/NEG + ADDI/SUBI/MULI, EQ/NE/LT/LE/GT/GE/NOT, JMP/JMPT/JMPF/CMPJ, GETSLOT/SETSLOT, GETSLOTO/SETSLOTO, GETGLOB/SETGLOB, GETDYN/SETDYN, GETBI/SETBI, CALL/CALLN/RET, WITHBEGIN/WITHNEXT/WITHEND, NEWARR/GETIDX/SETIDX/LEN, CONCAT/TOSTR, TOINT/TOFIXED, HALT. Names, numbers, operand formats and status live in `contracts/opcodes.json`.
- Values are 8-byte cells `{u32 tag; s32 payload}` with tags UNDEF/INT/REAL/BOOL/STR/ARR/INST/ASSET. Payloads are 32-bit handles (pool indices, arena offsets), never pointers (section 2.4; docs/research/verification.md claim 11).
- Calling convention, event ids, and the `.dsda` text form. CALL calls a DSS function by FUNC index. CALLN calls a builtin with an explicit argument count through a dense runtime function index that gen-builtins assigns, so `builtins.json` ordinals may exceed 255. Jumps use a signed 16-bit instruction offset (`AsBx`). Event ids are `kind:8 | arg:16` (alarm, user or button index, or the collision target's object id).
- A `.dsda` file names builtins and never contains the ABI hash or numeric builtin ids; the assembler stamps them from `contracts/builtins.json` and `contracts/opcodes.json`. Every committed `fixtures/**/*.dsdb` is generated from its sibling `.dsda` by `tools/gen-dsdb.ts`, so a builtin append never leaves a stale fixture.
- `builtins.json` entries: `{id (append-only ordinal), name, kind: function|variable|constant|alias|unsupported, params [{name,type,default?}], minArgs, maxArgs, returns, category, doc, example, allowedEvents, pure, since}`; variable entries add `scope` (instance|global), `type`, `readonly` and `arrayLength`, and constant entries add `value`. Types come from one closed list in `contracts/dsdb.md`. WS7 fills the `doc`/`example` fields left as `TODO(WS7)` in Phase 0 as T0 changes on its own branch, under the field-level shared-file rule of section 3.4; WS0 merges them at the daily integration.
- `tools/gen-builtins.ts` emits `runtime/gen/builtins_table.h`, `packages/compiler/src/gen/builtins.ts` and `packages/language-service/src/gen/builtins.ts`. `tools/gen-docs` (WS7) renders the reference pages from the same file. `tools/gen-opcodes.ts` generates `runtime/gen/opcodes.h` and `packages/dsdb/src/gen/opcodes.ts`, so adding an opcode is a one-file T1 change.
- The loader refuses a DSDB whose ABI hash does not match the runtime, with a readable message instead of misbehaving.

Freeze scope and hand-off:
- Phase 0 freezes the container (header, sections, 8-byte cells holding 32-bit handles, the calling convention with an argument count for CALLN, event ids, the `.dsda` grammar) and a single `contracts/opcodes.json` (name, number, operand format, stable|provisional).
- The stable set is 29 opcodes: LOADK, LOADI, LOADB, LOADUNDEF, MOV, ADD, SUB, MUL, DIV, IDIV, MOD, NEG, EQ, NE, LT, LE, GT, GE, NOT, JMP, JMPT, JMPF, CALLN, RET, CONCAT, TOSTR, GETGLOB, SETGLOB and HALT. These cover hello and conformance v0.
- The rest of the ~70 are provisional names with reserved numbers. Further numbers are reserved for int-specialised ADD/SUB/MUL/CMPJ variants, the M1 fallback (section 8).
- `packages/dsdb` and `opcodes.json` pass to WS4 at the tag, with WS2 as mandatory co-signer. `builtins.json` ordinals stay append-only under WS0.
- In weeks 1-4, `ws2-*` and `ws4-*` may merge each other's branches between checkpoints; the per-commit ownership check (section 3.4) checks each commit against its author stream. Both streams run in the cloud, so a cross-merge fetches and merges `origin/<target>`, the other stream's push target as recorded in `docs/status/cloud.md` on `origin/main` (section 7.5).

GML compatibility entries in `builtins.json`, consumed by the checker and the language service:
- `kind: "alias"` entries name the builtin they map to and the W lint they raise:
  - `instance_create_layer` and `instance_create_depth`: the layer/depth argument is ignored, with a W lint.
  - `keyboard_check`, `keyboard_check_pressed` and `keyboard_check_released` with `vk_left`, `vk_right`, `vk_up`, `vk_down`, `vk_space` and `vk_enter`, mapped to the D-pad, A and Start, with a W lint suggesting `button_*`.
  - `c_white`, `c_black`, `c_red`, `c_green`, `c_blue`, `c_yellow`, `c_orange`, `c_purple`, `c_gray`, `c_ltgray`, `c_dkgray`, `c_aqua`, `c_fuchsia`, `c_lime`, `c_maroon` and `c_navy` as the 16 UI colours.
- `kind: "unsupported"` entries: about 30 GML names, each with a dedicated E2xx message and a manual link: `image_alpha`, `image_blend`, `draw_text_ext`, `ds_list_*`, `ds_map_*`, `layer_*`, `sprite_get_width`, `mouse_x`, `mouse_y`, `ini_*`, `file_*`, `buffer_*`, `surface_*`, and so on. Example: 'image_alpha isn't available on the DS in DSDude 0.1. Try visible = false or a second sprite.'
- The list is printed in the manual's Differences from GameMaker chapter.

**C3 Asset pack layout + manifest.**
- NitroFS root: `game.dsdb`; `gfx/<sprite>.grf` (8bpp or 4bpp tiled, frames stacked vertically, palette embedded); `bg/<background>.grf` (8bpp text BG with map); `soundbank.bin`. The built-in 8x8 UI font is not a NitroFS file; it is linked into `arm9.elf` from `runtime/data/` (section 3.3). `font.grf` is reserved for v1.1 custom fonts.
- `soundbank.bin`: mmutil is called with all WAVs sorted by name, then all modules sorted by name. Ids are always read from the generated `soundbank.h`, because SFX ids share one counter with samples embedded in modules (docs/research/verification.md claim 9).
- NitroFS names are ASCII 0x20-0x7E and <= 127 chars. ndstool does not validate them, and longer names corrupt the FNT (`docs/research/verification.md` claim 3).
- Sound stems contain no '.' and are <= 63 chars.
- Sprite frames are padded with transparency to the next of the 12 OBJ sizes, and only frames larger than 64x64 are E4xx. OBJ VRAM is counted in 128-byte-aligned frame slots.
- Backgrounds are <= 512x512 and <= 1024 tiles; the soundbank is <= 1 MB.
- `build/assets.manifest.json` schema: names → ids, dimensions, frames, palette slots (16-colour and 256-colour pools per screen), VRAM bytes per room, RAM bytes per sound, budgets.

Per-room asset sets. A room's asset set consists of:
- the room's per-screen backgrounds, and the sprites and sounds referenced by the objects placed in the room;
- the objects reachable, transitively, through `instance_create` in their code;
- `sprite_index` assignments and `draw_sprite`/`audio_*` calls in that code.

The set is split per screen by each object's Screen, and `draw_set_screen` adds the other screen. The compiler emits the set into DSDB ROOMS (C2), and the asset pipeline budgets OBJ VRAM, palettes and sound RAM per room from it. Loading and room-change behaviour are in C6.

**C4 Toolchain driver API + BuildService.**
- Phase 0 publishes `packages/toolchain/src/api.ts`, which contains types only: `BuildService`, `BuildEvent`, `ToolPaths`, `EmulatorHandle`, `AssetManifest` (provisional until C3), `RoomAssetSet`, `CliCommand {name, summary, run(argv) → Promise<0|1|2>}`, `CompileFn = (project, manifest) => {dsdb, roomSets, diagnostics}` (synchronous and Worker-safe), `PackAssetsFn = (project, toolPaths) => Promise<{manifest, diagnostics}>` and `CheckRoomBudgetsFn = (manifest, roomSets) => {manifest, diagnostics}`. The same package gets a ~30-line `MockBuildService`, and `packages/asset-pipeline/src/preview.ts` gets its preview types (C12).
- WS1 implements against these types, WS6 mocks against them from its first day, and WS4 and WS5 export `compileProject` (from `@dsdude/compiler`, matching `CompileFn`), `packAssets` and `checkRoomBudgets` (both from `@dsdude/asset-pipeline`, matching `PackAssetsFn` and `CheckRoomBudgetsFn`; `BuildService` calls `checkRoomBudgets` after `compileProject`). These names are fixed.
- `@dsdude/toolchain` never imports `@dsdude/compiler` or `@dsdude/asset-pipeline`: they import its types, and TypeScript project references must stay acyclic. `BuildService` receives the three functions injected, and the composition roots (the `dsdude` CLI in `packages/cli` and the IDE build worker) wire them.
- Functions: `detectToolchain()`, `installToolchain(progress)`, `buildRuntime({jobs})` (default 8; the CLI takes `--jobs N` or `DSDUDE_MAKE_JOBS`), `runGrit(args)`, `runMmutil(args)`, `packRom(opts) → {ndsPath, info}`, `verifyRom()`, `EmulatorManager {ensureInstalled(kind), launch(rom, opts) → handle {onLine, stop}}`, and `BuildService {play, build, compileOnly, stop, cancel}` emitting `BuildEvent {phase, progress, diagnostics, log, timings}`. Tests use `createFakeToolchain()` and `MockBuildService`.
- `stop()` closes the emulator gracefully (`taskkill /PID`, then `/F` after 2 s), so its buffered stdout reaches `onLine` (C8). Emulator copies and their config files live under `DSDUDE_HOME` (default `%LOCALAPPDATA%\DSDude`; in development `<worktree>\.dsdude`, e.g. `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude`).
- Console tools spawn native `.exe` paths with `windowsHide` and timeouts. Emulators spawn without `windowsHide`. Bash (always `-lc` with the Wonderful env including `CHERE_INVOKING=1`) is used only for `make` and the install. `packRom()`, `runGrit()` and `runMmutil()` follow the spawning rules in section 6 WS1 (PATH prefix, explicit `-7`, partial outputs deleted, build paths under 250 characters).
- **Linux (cloud sessions).** The spawning above runs only in the local Windows streams (WS0, WS1, WS3, WS6, WS8). `@dsdude/toolchain` still imports on Linux and its tests pass there, because cloud sessions (`CLAUDE_CODE_REMOTE=true`) run tests on Linux, including the whole `npm run check && npm test` in the Phase-0 cloud probe:
  - `detectToolchain()` reports the toolchain as missing instead of throwing, and `ToolPaths` stays empty;
  - tests that need BlocksDS, grit, mmutil, ndstool or an emulator print `skipped: no ToolPaths`;
  - `createFakeToolchain()` and `MockBuildService` behave the same on both platforms;
  - `DSDUDE_HOME` is `$HOME/.dsdude`, set by the session-start hook (section 7.5).

  WS0 runs the skipped tests locally at every integration and appends each failure as an `IF-` entry to the owning stream's `docs/status/wsN.md` (section 7.2).
- CLI registration: each package exports `cliCommands: CliCommand[]` from its index (the type is in `api.ts`, so no package imports `packages/cli`), and WS1's `dsdude` registers them. WS4 (`dsdude compile`) and WS5 (`dsdude assets`) therefore never edit `packages/cli`.

**C5 IPC channel map.**
- Invoke channels: `project.open/save/create`, `assets.import/preview`, `build.play/build/compileOnly/cancel`, `emulator.stop/status/install`, `settings.get/set`, `toolchain.status/install`, `doctor.run`.
- Event channels: `build.log/progress/diagnostics`, `emulator.log/exit`, `project.changed`.
- The preload exposes only `invoke/on` for the listed channels; main validates the sender and the schema.
- Phase 0 ships `contracts/ipc.md` with the channel list and zod stubs; WS6 owns `packages/ipc-contract` and `ipc.md` from the tag and completes them.

**C6 Language spec, events and conformance corpus.**
- `contracts/language.md`: grammar, semantics (numbers per section 2.8, scopes, dynamic slots, event inheritance, `with`, truthiness), built-in variables, the omission list, and the section 4 semantics rules, each with one conformance fixture.
- `contracts/events.md`: event file names, frame order, room load order, inheritance, and when Outside Room fires (section 4).
- `fixtures/conformance/*.dss` with expected `DSD|LOG` output and expected traces, ordered by runtime feature: v0 pure computation (5 programs, Phase 0), v1 strings and arrays, v2 instances and events, v3 `with`, collisions and alarms, v4 rooms and draw. WS4 owns the `.dss` programs. WS2 owns the expected outputs in `fixtures/conformance/expected/`, and WS4 reviews them.
- Tier v0-v1 programs use the program form: one `fixtures/conformance/vN/NN-<name>.dss` file whose top-level statements run once as the DSDB function `__main` (no OBJS or ROOMS), after which the runtime prints `DSD|EXIT|0`. Top-level statements are legal only in program form; tier v2+ programs are small projects in folders. Expected output is `fixtures/conformance/expected/vN/NN-<name>.log`: only the `DSD|LOG|` lines, LF endings, final newline.
- Two host compilers run the same corpus against the same expected files. In the cloud, WS2 runs `make -f runtime/Makefile.host test` (Ubuntu gcc) before each commit, and WS4 checks its programs against that build. At every integration, WS0 runs `mingw32-make -f runtime/Makefile.host test` (MSYS2 gcc 15.2) locally. A mismatch that only the local run finds becomes an `IF-` entry for WS2 (section 7.2). A tier that is green only on Linux is not done.

Room changes:
- `room_goto`/`room_restart` take effect at the end of the frame.
- Room End fires; Destroy does not.
- Screens are blanked (`setBrightness`) while loading.
- Assets are not reloaded when the set is unchanged (`room_restart`).
- The music module and the room's effects are loaded before Room Start.
- Using an asset outside the loaded set raises R5xx 'spr_x is not loaded in rm_y'; the checker warns statically when it can prove this.

Small language rules:
- `touch_x`/`touch_y` keep the last touched position while the stylus is up; guard with `touch_check()`.
- A W lint flags non-ASCII characters in string literals passed to `draw_text`: 'the DS font only has A-Z, a-z, 0-9 and punctuation'.
- Random numbers come from the core's xorshift32. A non-zero seed in the DSDB header (a build with `--seed N`) wins; otherwise the core uses `dsd_plat_rng_seed()` (RTC + frame counter on the DS; `dsdude-host --seed N` on the host). `dsdude-host` and the e2e tests always pass a seed. `randomize()` is kept as a compatible no-op.
- Fixed-point array indices floor, with W04x.

**C7 Language-service host API.** `LanguageServiceHost` in `packages/lang/src/host.ts` (owner WS4, frozen at CP-B): `parse(text, fileName) → {diagnostics, spans}`, `symbolsAt(file, offset)`, `completionsAt(file, offset)`, `hover(name)`, `definitionAt(file, offset)`, `format(text)`, all over plain data. The AST stays internal to WS4, so the parser can change without ADRs.

**C8 Runtime log protocol + runtime artifact.**

Lines:
- `DSD|READY|<version>|<abihash>`
- `DSD|LOG|<text>`
- `DSD|ERR|<code>|<object>|<event>|<file>|<line>|<message>` (`<code>` is the R5xx code, so the IDE can link the catalog entry)
- `DSD|MEM|inst=14/512,arena=40/512,heapfree=1310,snd=120/768,objvram_top=48/128,objvram_bot=12/128,pal16_top=1/16,pal256_top=3/16,pal16_bot=0/16,pal256_bot=1/16,cstack=2/11` (KB unless a count), at room start
- `DSD|STAT|fps=60,inst=14,spr_top=9,spr_bot=2,oam_drop=0,aff_drop=0,sfx_drop=0,ops=1820`, once per second. `oam_drop` counts instances beyond 128 visible per screen, `aff_drop` rotated or scaled instances beyond 32 per screen that drew unrotated, and `sfx_drop` effects that found no free channel (section 3.3).
- `DSD|PAD|...` (flush pad lines, see below)
- `DSD|EXIT|<code>`

Printing:
- Every line goes through exactly one protocol, chosen at boot from the emulator ID at `0x04FFFA00`: `0x04FFFA10` raw with an embedded newline on melonDS/no$gba, and a legacy-signature RAM stub otherwise. `DSD|` lines never use libnds `nocashMessage()` (0x04FFFA14: no newline, 120-char truncation). See docs/research/verification.md claim 6.
- Each `DSD|READY`, `DSD|ERR` and `DSD|STAT` line is followed by a flush pad of >= 5 KB, written as at least five `DSD|PAD|` lines of <= 1023 chars each, which forces the emulators' block-buffered stdout to flush. EmulatorManager drops every `DSD|PAD|` line before `onLine` and accepts `\r\n` endings.
- Lines, pad lines included, are formatted in a static main-RAM buffer and are <= 1023 chars.
- An embedded newline in `LOG` or `ERR` text starts a new `DSD|LOG|` line, `\r` is dropped, and text longer than one line allows continues on further `DSD|LOG|` lines.

Artifact: `runtime/dist/arm9.elf`, `arm9-debug.elf` and `VERSION`, built by `npm run build:runtime` from `runtime/package.json` (WS3). It needs BlocksDS, so only local streams build it. `VERSION` records the semver, the git tree hash of `runtime/` (a commit cannot contain its own SHA) and the ABI hash.

**C9 Diagnostics.**
- One JSON shape `{severity, code, message, hint, file, line, col, endLine, endCol, source}` for compiler, assets, build and runtime.
- Code ranges: **E1xx** syntax, **E2xx** names/assets (including the unsupported GML names from C2), **E3xx** types/arity/event misuse, **E4xx** hardware and asset limits, **E6xx** build/toolchain, **W0xx** lints, **R5xx** runtime. Two sub-ranges sit in other catalogs: **E290-E299**, project-file problems found by `project-format`, and **E49x**, compiler-detected hardware limits such as more than 24 user slots.
- Each producer owns its range and its catalog: `packages/project-format/src/diagnostics/catalog.ts` (E290-E299, WS0), `packages/compiler/src/diagnostics/catalog.ts` (E1xx, E2xx except E29x, E3xx, E49x, W0xx; WS4), `packages/asset-pipeline/src/diagnostics/catalog.ts` (E4xx except E49x, WS5), `packages/toolchain/src/diagnostics/catalog.ts` (E6xx, WS1 then WS8) and `runtime/core/diagnostics/catalog.json` (R5xx, WS2; the runtime's messages follow it). `tools/gen-docs` renders every entry of the five catalogs, written for a 12-year-old, into `docs/reference/errors.md`.
- The TypeScript form (`Diagnostic`, `Severity` and a zod schema) lives in `packages/project-format/src/diagnostics.ts`, and every producer imports it from `@dsdude/project-format`.
- "One mistake yields one diagnostic."

`contracts/diagnostics.md` also defines the style:
- A message template: what happened / what to do / where.
- A banned-word list for messages: instruction, token, identifier, operand, arity, expression, opcode, VRAM, OAM, palette slot.
- R5xx examples in the same voice; R510 becomes 'obj_x / Step never finished: a loop there seems to run forever'.
- Codes are shown after the message, as a link.

New W lints: a room with no instances on either screen, a placed object with no sprite and no Draw event, and an unused sprite. Objects set to Visible off are exempt from the no-sprite lint, because that is the usual controller pattern (the Flappy sample's `obj_ctrl`, section 4). A Monaco code action applies the did-you-mean fix. A failed Play shows a toast 'Fix 1 problem to play' and focuses Problems.

**C10 CLI.**
- Subcommands: `dsdude compile|assets|build|play|screenshot|toolchain|emulator|doctor|gen-builtins`, with `--json` output.
- Flags: `--runtime <elf> --skip-compile --skip-assets --emulator melonds|desmume --no-build --seed N`, and `--jobs N` for runtime builds (default `DSDUDE_MAKE_JOBS`, else 8; C4 `buildRuntime`).
- `dsdude screenshot <rom> --frames N [--keys file] --out dir` writes top and bottom PNGs (section 6 WS1).
- Exit codes: 0 ok, 1 user-input diagnostics, 2 tool/environment failure.
- Commands come from each package's `cliCommands` export (C4); only WS1 edits `packages/cli`.
- Where it runs: `compile` and `gen-builtins` run on Linux too, and cloud streams use them (`npx dsdude compile --json`). `assets`, `build`, `play`, `screenshot`, `toolchain` and `emulator` need the local BlocksDS tools, emulators or py-desmume. Where those are missing, as in a cloud session, these commands exit 2 with an E6xx diagnostic instead of crashing.
- `dsdude doctor` also warns when `OneDrive.exe` is running and the repo or project path is under `%OneDrive%` (risk 10).

**C11 Platform seam `dsd_platform.h`.**
- `dsd_plat_init/frame_begin/frame_end`, `dsd_plat_read_input(dsd_input*)`, `dsd_plat_read_file(path, buf, cap) → size`, `dsd_plat_log(str)`, `dsd_plat_fatal(err)`.
- Graphics: `dsd_plat_sprite_load(grf) → handle`, `dsd_plat_bg_load(screen, grf)`, `dsd_plat_bg_scroll(screen, x, y)`, `dsd_plat_oam_submit(screen, list, n)`. The list is the core-built shadow OAM, already sorted, flipped, affine-assigned and capped per the section 3.3 sprite rules, so the result is identical on host and DS.
- UI layer (8-pixel cells): `dsd_plat_ui_text(screen, cx, cy, str, colour)`, `dsd_plat_ui_fill(screen, cx, cy, cw, ch, colour)`, `dsd_plat_ui_clear(screen)`.
- Sound: `dsd_plat_sfx_play/stop`, `dsd_plat_music_play/stop`, `dsd_plat_volume`.
- `dsd_plat_millis`, and `dsd_plat_rng_seed() → u32` (RTC + frame counter on the DS, `dsdude-host --seed N` on the host). The core calls it only when the DSDB header seed is 0; a non-zero header seed wins (C2).
- The room-load primitives that C3's per-room asset sets need (blanking both screens, freeing the previous set, loading the room's effects and music module) are named by WS2 before the CP-A freeze.
- Pure C11 on both sides: no libnds types cross the seam, and the core builds with the same flags under MSYS2 gcc and Linux gcc (`-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char`). WS2 develops on Linux gcc in the cloud; WS0 builds the host with MSYS2 gcc, and WS3 compiles the core for the DS, both locally.
- Seam types are fixed-width integers only, because `long` is 32-bit on Windows and 64-bit on Linux.

**C12 EditorPanel host API + asset preview API.**
- `EditorPanel {id, kind, open(resource), save(), dispose(), onDirty}`; host services (project store, IPC client, undo stack, toast); `fixtures/ide/mock-host`. WS6 owns these and freezes them at CP-A in hybrid and upgraded mode; under the standard-mode fallback, the late-start freeze rule of section 7.3 applies.
- `fixtures/ide/mock-host` also runs in plain headless Chromium without Electron (Vitest browser mode with `DSDUDE_SKIP_ELECTRON=1`), because WS6b and WS7 test their views against it in cloud sessions. WS6 checks those views in the Electron shell at checkpoints.
- Preview API from WS5: `previewSprite(png, opts) → {palette, indices, colorCount, frames}`. Its types are published in Phase 0, and the API freezes at CP-B in hybrid and upgraded mode (the section 7.3 rule under the standard-mode fallback). It is pure TypeScript and needs no `ToolPaths`, so WS5 builds and tests it in the cloud.

**C13 `runtime-limits.json`.** `spritesPerScreen 128, affinePerScreen 32, objVramBytesPerScreen 131072, objVramAlignBytes 128, obj16PalettesPerScreen 16, obj256PalettesPerScreen 16, bg256PaletteSlotsPerScreen 4, bgTilesMax 1024, bgMaxSize 512, uiLayerCellPx 8, instancesMax 512, instanceBlockBytes 384, userSlotsPerObject 24, roomArenaBytes 524288, stringArenaBytes 196608, soundRamBytes 786432, soundbankMaxBytes 1048576, dsdbMaxBytes 307200, heapReserveBytes 524288, alarms 8, scanlineObjCycles 1200, registersPerFrame 64`. It is the single source for meters, checker limits and docs.

`scanlineObjCycles` is a conservative warning threshold, computed per scanline as 2 per OBJ plus width (normal) or plus 10 + 2 x width (affine; double-size counts the doubled width). The DS budget is ~2,124 cycles (~1,530 with DISPCNT bit 23) per DSHack and DeSmuME's model. GBATEK documents only the GBA's 1,210/954, and neither melonDS nor DeSmuME enforces the limit (docs/research/verification.md claim 13). A hardware run of WS3's selftest scanline page may replace the threshold by T1.

**C14 Phase-0 fixtures.**
- From WS0 in Phase 0: `samples/minimal` and `samples/flappy` v0 (script-generated PNGs), `fixtures/bytecode/hello.dsda|.dsdb`, `fixtures/assets/` (script-generated 16x16 3-frame sprite PNG, 256x192 background PNG, one WAV via `tools/phase0/make-fixtures.ts`) and `fixtures/conformance/` v0 (5 pure-computation programs with expected `DSD|LOG` output).
- From the streams: `samples/hello`, `fixtures/runtime/hello/**` and `fixtures/build/**` from WS1 at toolchain-ok; the XM fixture from WS5; `fixtures/ide/mock-host` from WS6 by CP-A; `fixtures/bytecode/bench.dsda` from WS2; conformance programs 6-10 from WS4.
- `fixtures/runtime-core/flappy-nitrofs/` (the GRFs and soundbank for WS2's deterministic flappy trace) comes from WS0. WS2 runs in the cloud without grit or mmutil, so WS0 builds the folder locally with the installed tools and owns it (section 3.4). Likewise `fixtures/assets/golden/` (the py-desmume golden for WS5's screenshot check) comes from WS0, made locally.
- After the tag, each path belongs to the owner that `tools/ownership.json` names.

## 6. Workstreams

Effort is wall-clock for one instance. "Isolation" says how the stream tests without waiting on anyone. "Owned paths" summarises `tools/ownership.json` (section 3.4), which is the single source and wins on any difference. Contracts C1-C14 are in section 5; gates and milestones in section 8.

Rules for every stream:
- **Headless visual checks.** A definition of done about what a screen shows means that the `dsdude screenshot` PNG at frame N matches a golden PNG or passes a stated check. Instances read the PNG with their image-capable Read tool. The user is asked only when a screenshot is ambiguous.
- **No package-manager runs after the tag.** Never run `pacman`/`wf-pacman` after `phase0`. Toolchain changes are WS1 ADRs (WS8's after the hand-off; WS0's while neither is running, which happens only in the standard fallback), applied at a checkpoint when no builds are running. Cloud sessions install no system packages; changes to the cloud environments' setup script are WS0 ADRs.

**Operating mode: hybrid** (user decision, 2026-09-25; section 7.2 has the waves, capacity rules and calendar). Streams that need Windows tools run locally within the standard-mode limits; the others run as Claude Code cloud sessions on the private GitHub `origin`. Hybrid uses upgraded mode's checkpoints (CP-A, CP-B and CP-C at D+3, D+7 and D+14 after the tag), milestone criteria and ownership events, and release 0.1 lands around week 12-14. Standard mode (GitHub or cloud sessions unavailable for more than a day, every push target refused, or staggering cannot absorb the usage limits; release around week 16-20, checkpoints per 7.3) and upgraded mode (after a RAM upgrade; around week 12) are fallbacks only.

| Stream | Effort (one instance) | Hybrid (the plan): where and when | Standard fallback (12 GB: WS0 + 3 stream slots) | Upgraded fallback (32 GB: WS0 + up to 7 streams) |
|---|---|---|---|---|
| WS0 | 2 days, then part-time daily | local, `main` in the repo root; always running; one of the 4 local instances; integrates local and cloud branches | always running; counts as one of the 4 instances | always running |
| WS1 | 1.5-2 weeks | local slot 1 from hour zero; part-time after its M0 pieces; slot 1 passes to WS8 at CP-C | slot 1 from hour zero; hands off to WS3 once `toolchain-ok` and its M0 pieces are done | from hour zero; becomes WS8 at CP-C |
| WS2 | 4-5 weeks | cloud, environment `dsdude-ws2`, at the tag: Linux gcc host build of `Makefile.host`; the DS compile of the core is checked locally | slot 2 at the tag; hands off to WS7 at its definition of done | at the tag |
| WS3 | 3-4 weeks, then perf/hardware | local slot 2 from `toolchain-ok`; after its definition of done, slot 2 serves short local fix sessions | slot 1 after WS1; hands off to WS8 after M1 (~week 5-6), once the platform layer, selftest ROM, timer harness and `npm run build:runtime` are done (the M4 stress check and hardware notes pass to WS8 via `docs/kickoff/ws8.md`) | at `toolchain-ok` |
| WS4 | 3-5 weeks | cloud, `dsdude-ws4`, at the tag; fully | slot 3 at the tag; hands off to WS5 after M1 (~week 5) | at the tag |
| WS5 | 2-4 weeks | cloud, `dsdude-ws5`, from CP-A: the pure-TS parts; real grit/mmutil tests run locally at WS0's integration | slot 3 after WS4; hands off to WS6 at its definition of done | at CP-A |
| WS6 | 6-8 weeks (4-6 with WS6b) | local slot 3 at the tag; the only Electron stream until CP-C | slot 3 after WS5, once the pipeline exists; runs to release | at the tag; the only Electron stream until CP-C |
| WS6b | 4-6 weeks | optional cloud, `dsdude-ws6b`, from CP-B, only if usage limits allow; dropped first when they bite, and WS6 then builds the editors | folded into WS6 unless the memory gate frees a slot | only in a slot freed by a finished stream, and only if the memory gate allows; otherwise folded into WS6 |
| WS7 | 5-6 weeks | cloud, `dsdude-ws7`, from CP-A, headless first; the Electron IDE is opened only locally | slot 2 after WS2 | at CP-B, headless first |
| WS8 | to release | local slot 1 from CP-C (M1), taking over from WS1 with its leftovers | slot 1 after WS3 | the WS1 instance, from CP-C |

- **Local streams** (WS0, WS1, WS3, WS6, WS8): at most 4 local Claude Code instances including WS0, one Electron dev IDE and one emulator window machine-wide. Discord and Creative Cloud stay closed; the browser holds at most one claude.ai/code tab for steering cloud sessions (or use the mobile Code tab or the CLI). The standard fallback closes the browser too.
- **Memory gate (local instances, every mode):** add a local instance only if the minimum available memory that `tools/checkpoint.ps1` reports (from `tools/memsampler.ps1`'s log) since the last checkpoint stayed above 1.5 GB.
- **Cloud streams** (WS2, WS4, WS5, WS7, optional WS6b) use no local RAM. Each runs in its own environment `dsdude-wsN` on a clone of the private `origin` that the user creates on Day 0 (section 7.1); `docs/kickoff/README.md` section 8 is the procedure and section 7.5 its short form. A session starts with `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn`, then `bash tools/cloud/start.sh`; works on its stream line `wsN-<name>`; pushes only with `bash tools/cloud/push.sh`, after every green batch; merges `origin/main` daily and never rebases once WS0 has merged; never commits `package-lock.json` or runs `npm ci`. Sessions are ephemeral, so all state lives in the branch and `docs/status/wsN.md`.
- **Local-only checks.** Anything that needs MSYS2, BlocksDS, grit/mmutil, py-desmume, an emulator or Electron stays local. WS0 (with WS3 and WS6 where the table below says so) runs those checks for each merged cloud stream and appends every failure as an `IF-` entry to the `## Integration feedback` section of the stream's `docs/status/wsN.md` (section 7.2). The stream fixes open entries first; a Linux-only pass is never done.
- **Usage limits:** the peak is ~4 local + 4-5 cloud sessions (question 3). If limits bite, WS6b is dropped first, then WS7 and WS5 wait for a free cloud slot; if that is not enough, WS0 records the switch to the standard fallback (section 7.2).
- **Finished and handed-off streams** keep their owned paths. Later fixes in those paths run as short sessions of that stream from its kickoff file: a local stream in its worktree when a local slot is free (in hybrid, slot 2 after WS3's definition of done) or at a checkpoint; a cloud stream as a session in its environment. Standard fallback only: WS1 hands slot 1 to WS3, and between that hand-off and WS8's start WS0 handles fixes to WS1's paths (section 3.4). A freeze owed by a stream that has not started yet (e.g. WS6's panel API at CP-A in the standard fallback) follows the late-start rule of section 7.3: it falls due at the first checkpoint at least three working days after that stream starts.

**Cloud streams: tests and local verification.**

| Stream | Environment, stream line, `DSDUDE_PORT_BASE` | Linux test before each commit | Verified locally on Windows |
|---|---|---|---|
| WS2 | `dsdude-ws2`, `ws2-runtime-core`, 5120 | `make -f runtime/Makefile.host test` | WS0: `mingw32-make -f runtime/Makefile.host test` (gcc 15.2) on the same goldens, the DoD's cross-compiler identity check; `fixtures/runtime-core/flappy-nitrofs/` built with local grit/mmutil. WS3: the DS compile of the core, spikes 12 and 14, the M1 benchmark |
| WS4 | `dsdude-ws4`, `ws4-compiler`, 5140 | `npm test -w packages/compiler -w packages/lang -w packages/dsdb`, then `npx tsc -b packages/compiler packages/lang packages/dsdb` | WS0: the same tests; `hello.dsdb` on both emulators; the M1 gate (with WS3) |
| WS5 | `dsdude-ws5`, `ws5-assets`, 5150 | `npm test -w packages/asset-pipeline` | WS0: the same tests with real grit/mmutil, `npx dsdude assets samples/flappy`, GRF/soundbank identity, the XM fixture, the py-desmume golden in `fixtures/assets/golden/` (a WS0 row). WS3: both sides of spike 11 |
| WS7 | `dsdude-ws7`, `ws7-learn`, 5180 | `npm test -w packages/language-service -w packages/monaco-dss -w tools/gen-docs`, then `npx tsc -b packages/language-service packages/monaco-dss tools/gen-docs` | WS6: the Monaco glue in the Electron IDE at checkpoints. WS0/WS8: the M4 template screenshots and the M5 tutorial |
| WS6b | `dsdude-ws6b`, `ws6b-editors`, 5170 | `npm test -w packages/editor-core` (plus `-w apps/ide` for view changes) | WS6: the editors in the shell and the 60 fps checks |

### WS0 Lead: foundation, contracts, integration
- **Goal:** stand up the monorepo and the minimum-viable contracts and fixtures so every other stream can proceed in isolation. After that, WS0 stays on as a persistent local Claude Code instance on `main` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` that integrates local and cloud branches daily, pushes `main` and the gate tags to `origin`, runs checkpoints and drafts every ADR with a recommended answer.
- **Owned paths:**
  - Root config (`package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `.gitattributes`, `.editorconfig`, `.npmrc`, `.gitignore`), `vendor/README.md`, `README.md`, `LICENSE*`, `runtime/LICENSE`, `PLAN.md`, `CLAUDE.md`, `.githooks/**`, `.claude/**`, `.vscode/**`.
  - `contracts/README.md`, `contracts/CHANGELOG.md`, `contracts/builtins.json` (append-only), `contracts/project-format.md`, `contracts/diagnostics.md`; `docs/adr/**`, `docs/research/**`, `docs/kickoff/**`, `docs/status/checkpoint-*.md`, `docs/status/cloud.md` (the cloud-stream registry), and the closing `## Integration feedback` section of every `docs/status/wsN.md` (WS0 appends only); `tools/ownership.json`, `tools/tsconfig.json`, `tools/check-ownership.ts`, `tools/checkpoint.ps1`, `tools/memsampler.ps1`, `tools/adr-pending.ts`, `tools/phase0/**`, `tools/check-lockfile.mjs`, `tools/postinstall.mjs`, `tools/cloud/**`. The shared-file rules of section 3.4 let other streams append to `contracts/CHANGELOG.md`, create new `docs/adr/NNNN-*.md` files, and (WS7 only) fill `builtins.json` doc/example fields.
  - `packages/project-format/**`; `packages/dsdb/**` and `packages/ipc-contract/**` until the `phase0` tag (then WS4 and WS6); from the tag, `fixtures/runtime-core/flappy-nitrofs/**`, which WS0 builds locally with grit/mmutil for WS2 (see WS2), and `fixtures/assets/golden/**`, which WS0 generates locally with py-desmume for WS5's screenshot check (see WS5).
  - The generator scripts `tools/gen-*.ts`, whose outputs (`runtime/gen/**`, `packages/*/src/gen/**`, `fixtures/**/*.dsdb`) any commit may regenerate when it changes their input in the same commit.
  - `CODEOWNERS`, generated from `tools/ownership.json` (informational; integration uses no PRs).
- **Depends on:** nothing beyond the user's Day-0 steps (section 7.1): `git init` in place, the first commit with the minimal `.gitignore`, the private GitHub `origin`, and for the cloud streams the Claude GitHub App and the five `dsdude-wsN` environments.
- **Produces:** C1; C2 (container + `contracts/opcodes.json`); C4 types (`packages/toolchain/src/api.ts` + `MockBuildService`); drafts of C5 (`ipc.md` channel list and zod stubs), C6 (`language.md` v0.1, `events.md`), C8 (`log-protocol.md`) and C10; the C12 preview types (`packages/asset-pipeline/src/preview.ts`); C9; C13 (seed); C14 seeds.
- **Consumes:** none.
- **Deliverables:** section 7.1 has the day-by-day Phase 0 list and the deferred items with their owners.
  - **Day 1: workspace and hooks.** The monorepo is the existing folder `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`, which the user made a git repo in place on Day 0 and pushed to the private `origin` (section 7.1).
    - npm workspaces `apps/* packages/* tools/* runtime`, with the whole pinned stack from section 2.5 pre-installed into the right packages, so no stream has to edit another stream's `package.json`.
    - The root `package.json`'s `postinstall` runs `tools/postinstall.mjs`, which runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1` (set in cloud sessions, which never run Electron). Electron 42+ has no postinstall of its own and downloads its binary lazily. Without it, electron-vite 5.0.0 throws `Electron uninstall` when `node_modules/electron/path.txt` is missing, and Playwright's first launch downloads 158 MB inside its timeout. `ELECTRON_OVERRIDE_DIST_PATH` is documented for offline setups.
    - Biome, Vitest (`vitest.config.ts` with `test.projects`) and composite `tsc -b` wiring; `.gitattributes`, `.editorconfig`, `.npmrc` and the shared repo config (section 3.4). The Day-0 `.gitignore` is replaced by the full one, which keeps `vendor/*` ignored.
    - Hooks under `git config core.hooksPath .githooks`: `.githooks/pre-commit` runs Biome and `tools/check-ownership.ts` (stream read from `git config --worktree dsdude.ws`); `.githooks/commit-msg` adds the `DSDude-WS: WSn` trailer, enforces the lockfile rule and runs `tools/check-lockfile.mjs` when the lockfile is staged. Both skip merge commits (section 3.4). `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`) or any `mwccarm/`, `license.dat` or `dsd-*.exe` path.
    - `tools/ownership.json`, `tools/adr-pending.ts`, and `.claude/settings.json` with one permission allowlist shared by all instances, local and cloud (the allowlist and the `npm ci` deny rule in the first commit), plus the cloud allow rules and SessionStart hook (section 7.5).
    - **Cloud pieces**, pushed to `origin` before the Day-1 cloud probe (section 7.5): `tools/cloud/session-start.mjs` (silent unless `CLAUDE_CODE_REMOTE=true`), `tools/cloud/lib.sh`, `start.sh` and `push.sh` (committed LF with `--chmod=+x`), the lockfile guard `tools/check-lockfile.mjs` (section 3.4), `tools/check-ownership.ts` reading `origin/main` when `CLAUDE_CODE_REMOTE=true` or there is no local `main`, the registry `docs/status/cloud.md`, and `docs/status/wsN.md` stubs for WS2-WS8 and WS6b, each a title plus the closing `## Integration feedback` heading. WS1 creates `docs/status/ws1.md` at hour zero without the heading; WS0 appends it on `main` right after its first merge of `ws1-toolchain`.
    - `tools/checkpoint.ps1`. On Day 1 only its `-MemoryOnly` mode (the memory-gate summary) and `-AdrOnly` mode exist; the integration run follows by the end of D+1. That run:
      - starts with `git fetch --prune --tags origin '+refs/heads/ws*:refs/remotes/origin/ws*' '+refs/heads/claude/*:refs/remotes/origin/claude/*'`;
      - merges in dependency order with `--no-ff`, local streams' `wsN-<name>` and cloud streams' `origin/<push target>` from `docs/status/cloud.md` alike, enforcing `tools/ownership.json` per commit. The merges happen on a throwaway `integrate` branch, and `main` fast-forwards to it only when the suite is green (section 7.3);
      - regenerates the lockfile and runs `node tools/check-lockfile.mjs`;
      - runs `npm run check && npm test` on Windows, the host goldens and `dsdude screenshot` of `samples/hello`, plus the local-only checks of each merged cloud stream, whose failures it appends as `IF-` entries;
      - summarises the minimum available memory and peak commit charge since the last checkpoint from the sampler log, and warns when `OneDrive.exe` runs and the repo path is under `%OneDrive%` (risk 10);
      - writes `docs/status/checkpoint-N.md`, with a "Cloud streams" table, and runs `git push origin main --follow-tags`.
    - `tools/memsampler.ps1`, the memory sampler: `Get-Counter '\Memory\Available MBytes','\Memory\Committed Bytes'` once a minute, appended to `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\memsampler.log` (gitignored). WS0 starts it on Day 1 as a detached process (`Start-Process powershell -WindowStyle Hidden -ArgumentList '-File','tools\memsampler.ps1'`), and `checkpoint.ps1` restarts it when the log is more than 5 minutes stale, so it runs continuously.
    - An empty-but-green skeleton for every workspace package: `src/index.ts` exporting interface types, one passing test, and a `CLAUDE.md` brief of at most 60 lines (owner, owned paths, contracts, test command, isolation strategy), generated from one table by `tools/phase0/gen-briefs.ts`.
  - **Day 1: first contracts and project format.** The small contracts (`diagnostics.md`, `runtime-limits.json`, `log-protocol.md`, `cli.md` draft, `ipc.md`), `packages/toolchain/src/api.ts` with `MockBuildService`, and `packages/project-format`: zod schemas and load/save, with migrations once a v0 project exists. `samples/minimal` and `samples/flappy` v0 use script-generated PNGs.
  - **Day 2: language, bytecode and fixtures.** `contracts/language.md` v0.1 and `events.md`; the minimal C2 (`dsdb.md`, `opcodes.json` with the 29 stable opcodes listed in section 5 C2); `builtins.json` with signatures, `allowedEvents`, `pure` and min/max args for all ~90 builtins (docs and examples only for the ~30 Flappy uses, the rest `TODO(WS7)`); `tools/gen-builtins.ts`, `tools/gen-opcodes.ts` and `tools/gen-dsdb.ts` with a CI check that regenerated outputs are byte-identical; table-driven `packages/dsdb` (encode/decode/assemble/disassemble); `fixtures/bytecode/hello.dsda → hello.dsdb`, `tools/phase0/make-fixtures.ts` and conformance v0 (5 pure-computation programs); `docs/kickoff/wsN.md` updated with contract versions, owned paths and the env block (for cloud streams, the Linux env and "Cloud setup" block); `git tag -a phase0 -m 'phase0'`, then `git push origin main --follow-tags`.
  - **After the tag:**
    - the daily integration run, with `git push origin main --follow-tags` after every run and every tag, so cloud streams read `main`, the gate tags and `docs/status/checkpoint-N.md` on `origin`;
    - cloud launches: `git tag -a start-wsN -m 'launch WSn'; git push origin main 'start-wsN^{commit}:refs/heads/wsN-<name>' --follow-tags` (no local `wsN-<name>` branch, so local branch listings never mistake it for a local stream), a registry line in `docs/status/cloud.md`, then "launch WSn (cloud)" to the user;
    - `IF-` entries for every local-only failure of a cloud stream, closed with `- IF-<k> resolved by <sha>` (section 7.2);
    - `chore(deps): regenerate lockfile` commits on main; T1 reviews within 24 hours, and C2/C6/C11 merges within 24 hours in weeks 1-4 (section 7.4); the ADR inventory in each checkpoint report, cloud push targets included.
- **Definition of done:**
  - `npm install && npm run check && npm test` is green in `git clone C:\Users\zache\OneDrive\Desktop\Projects\DSDude C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean` (a clean clone, which also proves that `.gitattributes` wins over the system `core.autocrlf=true`), and `node_modules/electron/path.txt` exists afterwards. Then `Remove-Item -Recurse -Force C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean`.
  - The hooks are proven to run: a legitimate commit passes and gets its `DSDude-WS:` trailer, while a foreign-path commit and a stray `package-lock.json` are rejected, and a merge bringing a regenerated lockfile and another stream's files passes. `pre-push` refuses a pushed history that adds a file under `vendor/` other than `vendor/README.md`, including one committed and then untracked again. Makefiles and hooks check out with LF.
  - Every contract written in Phase 0 has a version header and a CHANGELOG section. `contracts/README.md` lists C3, C7, C11 and `runtime-artifact.md` as owed, with owner and deadline.
  - `hello.dsdb` disassembles to `hello.dsda`.
  - `docs/kickoff/wsN.md` exists for every stream.
  - `main` is on the private `origin` with the cloud pieces, and `git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md'` prints nothing (no vendor file other than `vendor/README.md` anywhere in GitHub's history).
  - The Day-1 cloud probe ran `bash tools/cloud/start.sh`, then `npm run check && npm test` green, or the switch to the standard fallback is recorded in the CLAUDE.md Status block (section 7.2).
  - Tag `phase0` exists on `origin`.
- **Can start immediately:** yes. **Effort:** 2 days, then a persistent part-time local instance (daily integration of local and cloud branches, checkpoints, ADR drafts). The user decides ADRs and approves checkpoint reports.
- **Isolation:** none needed; WS0 is the source of fixtures.

### WS1 Toolchain, build driver and Play
- **Goal:** de-risk the whole path from ELF + folder to a booting `.nds` on this machine, behind one TypeScript API (`BuildService`) and the `dsdude` CLI, and pass the `toolchain-ok` gate. Its paths later pass to WS8.
- **Owned paths:** `packages/toolchain/**` (including the E6xx catalog `src/diagnostics/catalog.ts`), `packages/cli/**`, `tools/fetch-vendor.ps1`, `tools/screenshot.py`, `tools/tools-pack.json`, `scripts/install-toolchain.ps1`, `scripts/smoke-test.ps1`, `samples/hello/**`, `fixtures/runtime/hello/**`, `fixtures/build/**`, `contracts/toolchain-api.md`, `contracts/cli.md`, `docs/manual/setup/**`.
- **Depends on:** WS0's Phase-0 C4 types (`packages/toolchain/src/api.ts`) and the C10 draft. The install itself starts at hour zero, with the user present, and waits for nothing.
- **Produces:** C4 (implementation), C10 (final), the C14 hello fixtures (`samples/hello`, `fixtures/runtime/hello/**`, `fixtures/build/**`) and the `toolchain-ok` gate.
- **Consumes:** C5, C8, C9, C14.
- **Deliverables:**
  - **Install: `scripts/install-toolchain.ps1`** (docs/research/verification.md claim 1).
    - Check that `C:\msys64\usr\bin\bash.exe` exists.
    - Download `https://wonderful.asie.pl/bootstrap/wf-bootstrap-windows-x86_64.tar.gz` (4.9 MB; the same payload as the Inno installer, with files at the archive root) to `C:\msys64\tmp\wf-bootstrap.tar.gz`.
    - Extract it with `bash.exe -lc 'mkdir -p /opt/wonderful && tar -xzf /tmp/wf-bootstrap.tar.gz -C /opt/wonderful'`.
    - If the `.exe` is used instead, run it as `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /DIR=C:\msys64 /LOG=<file>`.
    - Then run these as separate, exit-code-checked `bash.exe -lc` steps:
      1. `wf-pacman -Syu --noconfirm wf-tools`, repeated until `/opt/wonderful/bin/wf-config` exists (max 3 runs). The first run only upgrades wf-pacman itself and exits 0 without installing wf-tools (`docs/research/verification.md` claim 1).
      2. `wf-config repo enable blocksds`.
      3. `wf-pacman -Syu --noconfirm`.
      4. `wf-pacman -S --noconfirm blocksds-toolchain blocksds-docs` (~177 MB download, ~591 MB installed; 30-minute timeout).
    - The toolchain counts as installed when both `C:\msys64\opt\wonderful\bin\wf-config` and `...\thirdparty\blocksds\core\tools\ndstool\ndstool.exe` exist.
    - Every step runs with this environment: `MSYSTEM=UCRT64`, `CHERE_INVOKING=1`, `MSYS2_PATH_TYPE=inherit`, `PATH=C:\msys64\opt\wonderful\bin;%PATH%`, `BLOCKSDS=/opt/wonderful/thirdparty/blocksds/core`, `BLOCKSDSEXT=/opt/wonderful/thirdparty/blocksds/external`, `WONDERFUL_TOOLCHAIN=/opt/wonderful`.
    - The interactive and plan-B fallbacks are in section 2.1.
    - Smoke builds: `$BLOCKSDS/examples/graphics_2d/bg_regular_nitrofs` and `examples/maxmod/nitrofs`.
  - **`samples/hello`.**
    - Its Makefile uses the same `rom_arm9` shape as `runtime/Makefile`, so `buildRuntime()` has one convention.
    - `main.c` calls `nitroFSInit`, reads `nitro:/hello.txt` and prints `DSD|LOG|hello` through the C8 log writer: one protocol chosen from the emulator ID at `0x04FFFA00`, then the `DSD|PAD|` flush line.
    - Its ELF and ROM become `fixtures/runtime/hello/`, and the same run produces `fixtures/build/`.
  - **`detectToolchain()`** checks `C:\msys64\opt\wonderful\thirdparty\blocksds\core\tools\{ndstool\ndstool.exe,grit\grit.exe,mmutil\mmutil.exe}`, `...\sys\arm7\main_core\arm7_maxmod.elf` and `C:\msys64\opt\wonderful\toolchain\gcc-arm-none-eabi\bin\arm-none-eabi-gcc.exe`.
  - **`buildRuntime({jobs})`** is implemented as `spawn('C:\\msys64\\usr\\bin\\bash.exe', ['-lc', `make -j${jobs}`], {cwd: runtimeDir, env})` (`docs/research/verification.md` claim 2).
    - `jobs` defaults to 8. The CLI takes it from `--jobs N`, else from `DSDUDE_MAKE_JOBS`, which the kickoff env blocks set to 4 in hybrid mode and the standard fallback (section 7.2).
    - `env` is `process.env` plus `MSYSTEM=UCRT64`, `MSYS2_PATH_TYPE=inherit`, `CHERE_INVOKING=1`, `BLOCKSDS=/opt/wonderful/thirdparty/blocksds/core`, `BLOCKSDSEXT=/opt/wonderful/thirdparty/blocksds/external`, `WONDERFUL_TOOLCHAIN=/opt/wonderful`.
    - The existing PATH key (matched case-insensitively, `Path`/`PATH`) is prefixed with `C:\msys64\opt\wonderful\bin;`.
    - `CHERE_INVOKING=1` is required. Under Electron, SHLVL is unset, so the login shell runs `cd $HOME` from `/etc/post-install/05-home-dir.post`, and make then fails with 'No targets specified'.
    - `-l` is mandatory: wf-pacman.exe needs msys-2.0.dll, and the Makefile needs /usr/bin find/mkdir.
    - `BLOCKSDS` stays a POSIX path. MSYS2 converts it, and any `/opt/...` arguments, for the native gcc.
  - **`packRom()` and `verifyRom()`**, with `runGrit()`/`runMmutil()` following the same rules:
    - Console tools spawn with `windowsHide` and a timeout.
    - In development, PATH is prefixed with `C:\msys64\opt\wonderful\bin`. The tools need its UCRT64/GCC 16 runtime DLLs and otherwise exit 0xC0000135 with no output. The packaged IDE uses the tools-pack directory instead.
    - `-7` is always passed explicitly, because ndstool is fatal without `-7` when `BLOCKSDS` is unset.
    - Exit codes are checked and partial outputs deleted: a failed ndstool leaves a truncated `.nds`, and a failed mmutil leaves a partial `soundbank.h`.
    - Every build path stays under 250 characters.
    - The icon passed to `-b` is already quantised to 32x32 with <= 15 colours + transparent (WS5's icon step).
    - `verifyRom()` reads the header and the `NitroFS!` magic itself (section 3.2 step 6).
  - **EmulatorManager.**
    - Emulators live in `%DSDUDE_HOME%\emulators\`. melonDS 1.1 is downloaded and SHA-256-checked in development, and verified from the installer's bundled copy in the packaged IDE. The DeSmuME profile uses `desmume.ini` beside the exe (section 2.6).
    - The `melonDS.toml` writer uses the default key map with Qt codes A=88, B=90, X=83, Y=65, L=81, R=87, Start=16777220, Select=16777248, Up=16777235, Down=16777237, Left=16777234, Right=16777236. This is the WS6 Controls card mapping, and `desmume.ini` gets the same mapping.
    - Emulators spawn with `stdio:'pipe'` and **without** `windowsHide`.
    - Line streaming drops the `DSD|PAD|` lines, and a `DSD|` parser handles the rest.
    - Stop, and kill before a relaunch, run `taskkill /PID`, wait up to 2 s for the exit that flushes stdout, then use `/F`.
  - **Per-worktree isolation and process ownership.**
    - Each kickoff file sets `DSDUDE_HOME` (default `%LOCALAPPDATA%\DSDude`) per worktree, e.g. `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3\.dsdude` (gitignored).
    - EmulatorManager copies the emulators under it and writes `melonDS.toml`/`desmume.ini` there. melonDS 1.1 is a portable build, so its toml lives beside `melonDS.exe`.
    - EmulatorManager lives in the main process, or it persists the PID and start time under `DSDUDE_HOME` and reconciles with `taskkill /T` at startup and before-quit.
    - It waits for the old process to exit before rewriting `melonDS.toml`, because melonDS rewrites its toml on exit.
  - **`BuildService` and CLI.**
    - `BuildService` implements the Phase-0 `api.ts` types, with `--runtime/--skip-compile/--skip-assets` and cancellation. It calls WS4's `CompileFn` and WS5's `PackAssetsFn` and `CheckRoomBudgetsFn`, injected by the composition roots (C4) and wired as they land (CP-B in hybrid and upgraded mode; in the standard fallback by WS8, or by WS0 before WS8 starts).
    - Build output goes to `%DSDUDE_HOME%\build\<project-hash>` (default `%LOCALAPPDATA%\DSDude\build\<project-hash>`), not into the project. Export .nds copies from there.
    - `createFakeToolchain()` is kept alongside the Phase-0 `MockBuildService`, and the mock stays in sync with the real service.
    - The `dsdude` CLI registers the `cliCommands` that each package exports, so WS4 (`compile`) and WS5 (`assets`) never edit `packages/cli`.
  - **Headless screenshots (for `toolchain-ok`).** `tools/screenshot.py` and `dsdude screenshot <rom> --frames N [--keys file] --out dir` use py-desmume 0.0.9 with `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy` and write top and bottom PNGs. py-desmume is installed once, at hour zero with the user present, into the user site of `python` (section 7.1). The py-desmume caveats are listed under WS8.
  - **`dsdude doctor`** names the exact fix for every missing prerequisite. It reports exit code 0xC0000135 (3221225781) from any tool as 'missing DLL', warns about long project paths, and warns when `OneDrive.exe` is running and the repo path is under `%OneDrive%` (risk 10).
  - **Tools pack: `tools/fetch-vendor.ps1`.** It builds `vendor/tools-pack/` from `ndstool.exe`, `grit.exe`, `mmutil.exe`, the runtime DLLs, `arm7_maxmod.elf` and the license texts (section 2.11). The version pin is the committed `tools/tools-pack.json`, which records the SHA-256s and the single BlocksDS release everything comes from; `fetch-vendor.ps1` checks the files against it and copies it into `vendor/tools-pack/`. For the DLLs (`docs/research/verification.md` claim 7):
    - The pack holds exactly the DLLs found by a recursive `C:\msys64\ucrt64\bin\objdump.exe -p` import walk. Today that is `libstdc++-6.dll`, `libgcc_s_seh-1.dll`, `libwinpthread-1.dll` and `libiconv-2.dll`; `mmutil.exe` needs none. KERNEL32 and `api-ms-win-*` are ignored.
    - They are copied only from `C:\msys64\opt\wonderful\bin` (Wonderful's `runtime-gcc-libs`, the same UCRT/GCC 16 build as the tools), never from `C:\msys64\ucrt64\bin` or Git's `mingw64\bin`.
    - A check asserts that each copied DLL imports `api-ms-win-crt-*` and not `msvcrt.dll`.
    - A clean-PATH test runs with `PATH=C:\Windows\System32`: `ndstool -V`, `grit -V` and `mmutil` exit 0, and without the DLLs ndstool exits 0xC0000135.
    - `ldd.exe` is not used: it resolves through the caller's PATH, lists system DLLs and prints POSIX paths.
  - **Unfinished work moves to WS8.** Whatever is left of the tools pack, `dsdude doctor`, the DeSmuME-profile polish, and wiring `compileProject`/`packAssets` into `BuildService` for whichever has not landed when WS1 hands off goes to WS8 through `docs/kickoff/ws8.md`.
- **Definition of done:**
  - The install script completes unattended on this machine with no UAC prompt, and `dsdude toolchain status --json` reports every path.
  - **`toolchain-ok`:** `dsdude build samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets && dsdude play samples/hello --no-build` boots in melonDS and DeSmuME with the emulator window visible and `DSD|LOG|hello` captured live (flush pad) or at graceful Stop, with no duplicate lines on melonDS; `dsdude screenshot` returns both PNGs.
  - `buildRuntime()` succeeds when spawned with SHLVL unset, as under Electron.
  - `packRom()`'s header check passes on hello, and each of these fixture ROMs triggers E6xx (`docs/research/verification.md` claim 3): one with its `NitroFS!` magic zeroed, one with its FAT size zeroed (both hex-patched by the test), and one packed from an empty `-d` folder.
  - 20 consecutive Play launches leave no orphan emulator.
  - Each worktree's emulator config lives only under its `DSDUDE_HOME`.
  - The tools-pack clean-PATH test passes, or is recorded in `docs/status/ws1.md` as a WS8 leftover.
- **Can start immediately:** yes, locally in slot 1 (hour zero; the install needs ~30 min with the user present, who consents by launching WS1 and approving its prompts). **Effort:** 1.5-2 weeks to its M0 pieces: `packRom`, EmulatorManager, log capture, `BuildService`/`MockBuildService` and `dsdude screenshot`. In hybrid mode (as in upgraded mode) WS1 then continues part-time until CP-C, when slot 1 passes to WS8 with WS1's leftovers. The standard fallback hands slot 1 to WS3 at M0 instead.
- **Isolation:** tests mock `child_process`; real-tool tests skip when `detectToolchain()` fails; the hello ELF stands in for the runtime.

### WS2 Runtime core (portable C, host-tested)
- **Goal:** the DSDB loader, VM, value model and engine core (instances, events, motion, collision, alarms, animation, draw lists, strings, arrays, builtins) as portable C11 behind `dsd_platform.h`, with `dsdude-host` (`dsdude-host.exe` on Windows) as the conformance oracle. WS2 runs as a cloud session and builds the host with Linux gcc; the Windows and DS builds of its code run locally.
- **Owned paths:** `runtime/core/**`, `runtime/host/**`, `runtime/Makefile.host`, `runtime/tests/**`, `runtime/CLAUDE.md`, `fixtures/bytecode/**`, `fixtures/runtime-core/**` except `flappy-nitrofs/` (WS0), `fixtures/conformance/expected/**`; `contracts/log-protocol.md` and `contracts/runtime-limits.json` from the tag; `contracts/dsdb.md` co-owned with WS4.
- **Depends on:** WS0 (C2, C6, C14).
- **Produces:** C8 (protocol), C11 (by CP-A), C13 and the conformance expected outputs.
- **Consumes:** C2, C3, C6, C9.
- **Deliverables:**
  - **Conformance tiers.** `fixtures/conformance/` is ordered by runtime feature: v0 pure computation (5 programs, Phase 0); v1 strings and arrays; v2 instances and events; v3 `with`, collisions and alarms; v4 rooms and draw. The first-week deliverable is the loader, VM, strings and `show_debug_message` on the host, so v0 and v1 execution goldens exist by D+7. Expected outputs live in `fixtures/conformance/expected/` (owned by WS2, reviewed by WS4).
  - **Values and numbers.**
    - `value.h`: 8-byte cells holding 32-bit handles, never pointers, with layouts checked by `static_assert`. Numbers are int32/Q20.12 with 64-bit intermediates. The debug overflow trap uses `__builtin_{add,sub,mul}_overflow`.
    - `fixed.c` holds the vendored libnds trig LUTs, the division and `sqrtf32` models, and the octant-LUT `atan2` (sections 2.4 and 2.8).
  - **Loader and VM.**
    - `loader.c`: magic/version/ABI hash checks, section mapping and R5xx codes.
    - `vm.arm.c`: computed goto with the `no-gcse`/`no-crossjumping` pragma (WS3 Makefile notes). Attributes compile to nothing on the host. A per-frame instruction watchdog stops runaway scripts.
  - **Memory.** `strings.c`/`arrays.c`/`heap.c` use fixed arenas.
  - **Instances.** `instances.c` uses fixed 384-byte blocks (`docs/research/verification.md` claim 13).
    - Each block holds a native C struct of the built-in variables (~180 B): untagged s32/Q20.12 fields, a header, list/grid links, `alarm[8]` and a cached bbox.
    - Up to 24 user variables follow as 8-byte cells.
    - The pool holds 512 blocks = 192 KB.
    - The compiler emits E49x when an object, including its parents, needs more than 24 user slots.
    - GETBI/SETBI convert between the struct fields and cells.
  - **Events and slots.**
    - `events.c` runs events in C6 order, with event inheritance, `event_inherited()` and `with` snapshot/unwind semantics per `contracts/language.md`.
    - GETDYN/SETDYN look up dynamic slots by binary search over the DSDB OBJS table, then fall back to the 8-entry overflow map.
  - **Rooms.** `rooms.c` owns a 512 KB room arena that resets on room change. `room_goto`/`room_restart` take effect at the end of the frame. Each room loads its asset set from DSDB ROOMS (section 3.2 and 5 C3/C6).
  - **Engine.** `collision.c` (grid broadphase + AABB/circle, matching only instances on the same screen); `alarms.c`; `anim.c`; `drawlist.c` with the section 3.3 shadow OAM policies (stable sort by (depth, id), flip bits, affine sets, overflow counted in `DSD|STAT`); an xorshift32 PRNG seeded from `dsd_plat_rng_seed()`.
  - **Builtins and debug output.** `builtins/*.c` dispatch through tables generated into `runtime/gen/builtins_table.h`, and `debug.c` writes the C8 lines.
  - **Host platform.** `runtime/host/` records a JSONL trace and PNG frames. Files are opened `"wb"`. `--seed N` is what the host's `dsd_plat_rng_seed()` returns; a non-zero seed in the DSDB header still wins (C2, C11).
  - **`Makefile.host`** builds with two compilers from one file: Linux gcc (GCC 13 in the cloud image) as `make -f runtime/Makefile.host test`, WS2's own test, and MSYS2 UCRT64 gcc 15.2 under `C:\msys64\ucrt64\bin\mingw32-make.exe` as `mingw32-make -f runtime/Makefile.host test`, which WS0 runs at every integration. Output goes to `runtime/build-host/`. Rules:
    - identical flags on both compilers: `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char -Wall -Wextra -DDSD_HOST`;
    - no `-Werror`, because GCC 13 and 15 warn differently;
    - the `test` target also builds a `-fsanitize=undefined -fsanitize-trap=all` variant on both (trap mode; MSYS2 has no `libubsan`);
    - `ifeq ($(OS),Windows_NT)` only for `EXE := .exe`, and recipes that run in both cmd.exe and `/bin/sh`;
    - fixed-width integers only (`long` is 32-bit on Windows, 64-bit on Linux), and no reliance on more than 1 MB of stack;
    - on Windows, every gcc spawn has `C:\msys64\ucrt64\bin` on PATH. Without it, gcc exits 1 with no message (`docs/research/verification.md` claim 11).
  - **Tests and fixtures.** Division-equivalence and trig-LUT tests. The M1 microbenchmark program `fixtures/bytecode/bench.dsda`, using the section 8 M1 op mix, with host and DS timer harnesses. A 300-instance stress fixture.
- **Definition of done:**
  - Both `make -f runtime/Makefile.host test` (Linux gcc, in the cloud) and `mingw32-make -f runtime/Makefile.host test` (MSYS2 gcc, WS0's integration) run every conformance tier that has landed and match the same expected logs and traces. A tier that is green only on Linux is not done. The tier schedule is v0-v1 by D+7, v2 by ~D+14, v3 by ~D+21-28 and v4 (rooms and draw) by ~D+28-35, which is before M2 (and before WS2's hand-off in the standard fallback, ~week 5-6). Only goldens for builtins added later come after M2, as short WS2 sessions.
  - `dsdude-host <flappy build>/nitrofs --frames 600 --seed 1 --input fixtures/runtime-core/flappy-keys.txt --trace out.jsonl` is deterministic across runs and identical between the Linux gcc build (WS2's cloud session) and the MinGW build (WS0's integration). `<flappy build>` is `dsdude compile samples/flappy` output plus the flappy GRFs and soundbank. The cloud has no grit/mmutil, so WS0 builds those locally into `fixtures/runtime-core/flappy-nitrofs/` (a WS0 row in `tools/ownership.json`): by hand with the section 2.9 command lines from the `samples/flappy` PNGs/WAVs until WS5's `packAssets` exists, then with `dsdude assets samples/flappy`.
  - `DSD|ERR` lines carry object/event/file/line.
  - The core compiles unchanged under the DS Makefile (WS3), with no `#ifdef __NDS__` outside `dsd_platform.h` implementations. WS3 and WS0's local runtime build check this after each merge; failures come back as `IF-` entries.
  - The M1 gate is met, measured with WS3's timer harness: >= 35,000 typed simple ops per full 1,120,380-cycle frame. On melonDS the bar is >= 44,000 unless a hardware run calibrates the derating (section 8 M1). Below the gate, WS2 first adds the reserved int-specialised opcodes.
- **Can start immediately:** yes, at the tag, as a cloud session (`dsdude-ws2`). **Effort:** 4-5 weeks.
- **Isolation:** hand-assembled `.dsda` fixtures from `packages/dsdb`, host build only; no emulator needed until CP-B. In the cloud: the Ubuntu gcc build `runtime/build-host/dsdude-host`, the conformance tiers, deterministic `--seed` traces and the UBSan trap, against the goldens in `fixtures/conformance/expected/**`.

### WS3 DS platform layer and runtime ELF
- **Goal:** implement `dsd_platform.h` on libnds/maxmod, own the BlocksDS Makefile and the shipped `runtime/dist/arm9.elf`, and bring up the hardware with a selftest ROM before the core exists.
- **Owned paths:** `runtime/platform/ds/**`, `runtime/selftest/**`, `runtime/data/**` (the 8x8 font), `runtime/Makefile`, `runtime/package.json`, `runtime/dist/**`, `fixtures/runtime/**` except `hello/` (including the selftest GRFs and soundbank WS3 makes with the installed grit/mmutil), `contracts/runtime-artifact.md`, `docs/manual/runtime-build.md`.
- **Depends on:** WS1's `toolchain-ok` gate and WS2's C11 draft (frozen at CP-A).
- **Produces:** C8 (artifact).
- **Consumes:** C3, C11, C13.
- **Deliverables:**
  - **Workspace package.** `runtime/package.json` joins the npm workspaces, so WS3 owns `npm run build:runtime` rather than a script in the WS0-owned root `package.json`.
  - **`runtime/Makefile`** (`docs/research/verification.md` claims 2, 4 and 11): `NAME := dsdude_runtime`, `SOURCEDIRS := core/src platform/ds/src`, `INCLUDEDIRS := core/include gen`, `BINDIRS := data` for the 8x8 font, `LIBS := -lmm9 -lnds9`, `LIBDIRS := $(BLOCKSDS)/libs/maxmod`, `CFLAGS := -std=c11 -fwrapv -fno-strict-aliasing -funsigned-char` (set before the include, which appends its own flags), `include $(BLOCKSDS)/sys/default_makefiles/rom_arm9/Makefile`. Notes:
    - The default Makefile appends `$(BLOCKSDS)/libs/libnds` and `-lc` itself. Without the maxmod LIBDIRS, `maxmod9.h` and `-lmm9` are not found.
    - `vm.arm.c` carries `#pragma GCC optimize ("no-gcse", "no-crossjumping")` so every handler keeps its own dispatch.
    - `ITCM_CODE` does not select ARM mode; the `.arm.c` suffix does.
  - **Selftest ROM (`runtime/selftest/`)** exercises 128 sprites per screen with extended palettes and 128-byte-aligned frame uploads under `SpriteMapping_1D_128`, a scrolling 8bpp GRF room background (BG1) on each screen, the BG0 UI layer with text and a filled rectangle, touch and the D-pad, a maxmod effect and module from `nitro:/soundbank.bin`, NitroFS reads, and the C8 log writer on both emulators. It also:
    - times a 1 MB NitroFS read on melonDS, which sets the room-load budget;
    - reports the C-stack high-water mark;
    - has a scanline page for the hardware run that sets `scanlineObjCycles`: N 64x64 normal or affine sprites on one line, with the D-pad stepping N.
  - **Platform layer:**
    - **VRAM and sprites.** `vramSetBankA..I` per the section 3.3 bank table (extended palettes written while their bank is mapped as LCD, then remapped); `oamInit(&oamMain, SpriteMapping_1D_128, true)` and sub; a per-screen OBJ VRAM allocator with 128-byte alignment; shadow OAM submitted at VBlank.
    - **Graphics loading.** `grfLoadPath` wrappers load into malloc'd buffers, `dmaCopy` to VRAM and free in LIFO order.
    - **UI layer.** `dsd_plat_ui_text/ui_fill/ui_clear` draw on BG0: 16 UI colours, with a double-buffered map committed at VBlank. The room background is on BG1.
    - **Input.** `touchRead`/`scanKeys`.
    - **Audio.** Init order `nitroFSInit` → `soundEnable()` → `mmInitDefault("nitro:/soundbank.bin")` with every result checked; `mmLoadEffect` return codes become R5xx; one-shot `mmEffect` calls are followed by `mmEffectRelease`; music uses `mmStart`.
    - **Log writer (C8).** The protocol is chosen at boot from the emulator ID at `0x04FFFA00`: `0x04FFFA10` raw on melonDS/no$gba, a legacy-signature RAM stub otherwise. Message buffers live in main RAM, the flush pad (at least five `DSD|PAD|` lines of <= 1023 chars) follows every READY, ERR and STAT line, and libnds `nocashMessage` is not used.
    - **RNG seed.** `dsd_plat_rng_seed()` combines the RTC and the frame counter.
    - **Errors and console.** The red error box goes on the bottom screen with START-to-restart, and SELECT toggles a console overlay. Both use the UI layer, not `consoleInit`.
  - **`npm run build:runtime`.**
    - It produces `arm9.elf` (stripped), `arm9-debug.elf` and `VERSION`. `VERSION` records the semver, the git tree hash of `runtime/` (a commit cannot contain its own SHA) and the ABI hash.
    - It prints `.itcm`/`.dtcm` usage from `arm-none-eabi-size`, against a 24 KB ITCM ceiling for the VM plus hot builtins, since libnds already places exception vectors in ITCM.
  - **M1 benchmark support.** The DS-side timer harness for the M1 microbenchmark. The M1 run compares `-mlong-calls` (the BlocksDS `.arm.c` default) against plain BL for builtin calls from the dispatch loop, and keeps whichever is faster. BL reaches main RAM from ITCM at 0x01000000.
  - **Later** (standard fallback: WS8, via `docs/kickoff/ws8.md`). Hardware notes (DLDI/argv, scanline limits) and the GDB attach recipe (`gdb-multiarch -ex "file runtime/dist/arm9-debug.elf" -ex "target remote localhost:3333"`).
- **Definition of done:**
  - The selftest ROM's `dsdude screenshot` at frame N matches its golden PNG.
  - The selftest ROM boots in melonDS and DeSmuME with its `DSD|` lines captured, and on hardware later.
  - `hello.dsdb` prints on both emulators by M1, with no duplicate lines on melonDS.
  - `arm9.elf` builds reproducibly with `npm run build:runtime` and is committed with its `VERSION`.
  - ITCM usage is <= 24 KB, and the memory/usage report matches C8.
  - `DSD|STAT` shows 60 fps with the 300-instance stress fixture by M4 (standard fallback: handed to WS8 via `docs/kickoff/ws8.md`).
- **Can start immediately:** no. It starts locally in slot 2 at `toolchain-ok` (hybrid; upgraded mode also at `toolchain-ok`; the standard fallback in slot 1 after WS1), selftest first. **Effort:** 3-4 weeks, then perf/hardware work alongside WS2.
- **Isolation:** the selftest ROM needs no core, no compiler and no asset pipeline. Its GRFs and soundbank come from `fixtures/runtime/`, made by hand with the installed grit/mmutil.

### WS4 DSS language and compiler
- **Goal:** lexer, error-recovering parser, binder, checker with beginner-grade diagnostics, formatter, codegen and DSDB writer, byte-for-byte per C2, plus the C7 language-service host API.
- **Owned paths (from the tag):** `packages/lang/**`, `packages/compiler/**` (including `src/diagnostics/catalog.ts`), `packages/dsdb/**` (WS2 co-signs changes), `contracts/opcodes.json`, `contracts/language.md`, `contracts/events.md` (WS2 co-signs), `contracts/dsdb.md` (co-owned with WS2), `fixtures/compiler/**`, `fixtures/conformance/**` except `fixtures/conformance/expected/**`, and `samples/minimal/**` and `samples/flappy/**` until M2 (then WS7).
- **Depends on:** WS0.
- **Produces:** C7 (host API, frozen at CP-B), C6 (final) and C2 changes (co-signed by WS2).
- **Consumes:** C1, C2, C3, C9, C13.
- **Deliverables:**
  - **Parser.**
    - A hand-written lexer and a recursive-descent/Pratt parser with optional semicolons: a statement ends where the next token cannot continue it.
    - The parser resynchronises on `;`, statement keywords, `}` and newlines.
    - W032 warns when a line starting with `(` or `[` continues the previous line's expression.
    - The AST is internal to WS4, not a contract.
  - **Host API.** `packages/lang/src/host.ts` implements the C7 host API over plain data: `parse`, `symbolsAt`, `completionsAt`, `hover`, `definitionAt` and `format`.
  - **Binder.** Locals → registers, instance slots with parent chains, globals, built-in variables, asset ids from the project model, user and builtin functions. For DSDB OBJS, each object gets a sorted (symbolId, slot) table with its parent id and an ancestor bitset.
  - **Checker.** A small type lattice (`unknown number int fixed string bool array instance undefined`) that flags:
    - undefined names, with a Levenshtein did-you-mean over builtins plus project symbols;
    - string + number;
    - wrong arity;
    - `draw_*` outside Draw (`allowedEvents`);
    - `=` in conditions (W030);
    - `touch_in_instance(self)` or an instance touch event (`touch_pressed/released/held.dss`) in an object whose Screen is Top (W031). The global `touch_pressed()`, `touch_check()`, `touch_released()`, `touch_x` and `touch_y` are legal everywhere;
    - squaring fixed positions (W040);
    - more than 24 user slots in an object including its parents (E49x, in the compiler catalog; section 5 C9);
    - GML names from `builtins.json`: `kind: "alias"` entries compile with a W lint, and `kind: "unsupported"` entries get a dedicated E2xx;
    - calling another object's helper (E2xx: *"die() is a helper of obj_bird. To use it from obj_pipe, move it to Scripts."*).

    Messages follow the template and banned-word list in `contracts/diagnostics.md`. A CI check requires `samples/*` and `templates/*` to compile with zero diagnostics.
  - **Code generation.**
    - Slot layout, and per-room asset sets emitted into DSDB ROOMS.
    - Three-address IR over up to 200 virtual registers, with linear scan down to 64.
    - Peephole passes: constant folding, fused compare+jump, `ADDI/SUBI/MULI`, and the reserved int-specialised opcodes if the M1 gate needs them.
    - DSDB writer with ABI hash and DBG table.
  - **Tools and entry points.** `dsdb-dis`; a formatter that inserts semicolons; `compileProject` matching `CompileFn` (section 5 C4), plus a `cliCommands` export providing `dsdude compile <project> -o <build>/nitrofs/game.dsdb --json` (`<build>` is the project's build directory, section 3.2); catalog entries in `src/diagnostics/catalog.ts` for every E1xx/E2xx/E3xx/W0xx code, which WS7's gen-docs turns into `docs/reference/errors.md`; conformance programs 6-10.
- **Definition of done:**
  - The conformance corpus and `samples/*` compile to byte-identical goldens and round-trip through `dsdb-dis`.
  - Every conformance tier passes on the host as soon as that tier's runtime feature lands in `dsdude-host`.
  - Each of the 20 most common beginner mistakes has a dedicated friendly message with a test: missing closing parenthesis, `=` in if, undefined variable, misspelt builtin, string + number, wrong arity, `draw_sprite` in Step, unknown sprite name, missing closing brace, assignment to a constant, and so on.
  - One mistake yields one diagnostic; `samples/*` and `templates/*` produce zero diagnostics; Flappy compiles in < 100 ms warm; no dependency on Monaco, Electron or Node-only APIs (runs in a Web Worker).
- **Can start immediately:** yes, at the tag, as a cloud session (`dsdude-ws4`). **Effort:** 3-5 weeks. Later tiers are checked by short WS4 cloud sessions.
- **Isolation:** disassembly-snapshot goldens (`.dss → .dsda`) and diagnostic-snapshot tests need no runtime. Execution goldens arrive tier by tier as WS2's runtime lands them: v0 pure computation and v1 strings/arrays by D+7, v2 instances/events by ~D+14, v3 `with`/collisions/alarms by ~D+21-28, v4 rooms/draw by ~D+28-35 (before M2). Until a tier lands, its goldens are disassembly snapshots only. In the cloud: the goldens, `npx dsdude compile --json`, `node tools/gen-dsdb.ts`, and conformance 6-10 on the Linux `dsdude-host`.

### WS5 Asset pipeline
- **Goal:** convert sprites, backgrounds, sounds and the icon into the NitroFS pack deterministically and incrementally, enforcing DS limits with friendly E4xx messages, and provide the preview API the import dialog uses.
- **Owned paths:** `packages/asset-pipeline/**` (including `src/diagnostics/catalog.ts`), `fixtures/assets/**` except `fixtures/assets/golden/**` (WS0's, see the DoD), `contracts/assetpack.md` and `docs/manual/assets/**`.
- **Depends on:** WS0. The real grit/mmutil tests also need WS1's `toolchain-ok`, and run only locally, at WS0's integration.
- **Produces:** C3 (`contracts/assetpack.md`, written on WS5's first day from section 2.9) and the preview API (part of C12, frozen at CP-B).
- **Consumes:** C1, C4, C9, C13.
- **Deliverables:**
  - **Sprite import.**
    - PNG decode (pngjs), strip slicing, and vertical re-stitching with 128-byte-aligned frames.
    - Frames up to 64x64 are padded with transparency to the next of the 12 OBJ sizes. Larger frames are E4xx.
    - Transparency handling: alpha, magenta or the top-left pixel → index 0.
    - The RGB555 quantizer: histogram + Wu/median-cut to 255 or 15 colours, with optional Floyd-Steinberg/Bayer dithering.
    - Automatic 16/256-colour mode.
    - `sprite.json` defaults: the origin is the frame centre, the bbox is the opaque bounds, and an image whose size is exactly one OBJ size imports as one frame.
  - **Tool wrappers.** grit and mmutil wrappers sit behind `ToolPaths`. They use the section 2.9 command lines and the same spawn rules as WS1's `packRom()`.
  - **Sound.**
    - Decode with `@audio/decode-wav`/`@audio/decode-mp3`, then resample.
    - WAV files are written with only `fmt `/`smpl`/`data` chunks, including loop points.
    - Tracker files pass through unchanged.
    - MP3 dropped as music is E4xx (music must be a tracker file). MP3 is still accepted for short effects.
    - mmutil gets all WAVs sorted by name, then all modules sorted by name. Ids are always read from the generated `soundbank.h`.
    - The XM fixture.
  - **Icon.** Quantised to 32x32 with <= 15 colours + transparent.
  - **Cache and manifest.** A content-hash cache and `assets.manifest.json`, including RAM bytes per sound.
  - **Per-room budgets.** `checkRoomBudgets` (C4), computed from the compiler's room asset sets: padded OBJ VRAM, 16- and 256-colour OBJ palettes, BG palette slots, and sound RAM against `soundRamBytes`.
  - **Preview.** `previewSprite()` returns original vs converted pixels, colour counts and detected frames.
  - **Entry points.** `packAssets` matches `PackAssetsFn`, `checkRoomBudgets` matches `CheckRoomBudgetsFn`, and a `cliCommands` export provides `dsdude assets <project> --json`.
  - `image-q` is used only as a test cross-check.
- **Definition of done:**
  - Golden tests: fixture PNG/WAV → byte-identical GRF/soundbank across runs. Unit tests mock grit; integration tests use the real grit and skip if it is absent (in the cloud they print `skipped: no ToolPaths`, and WS0's local integration runs them).
  - A second run on the sample project takes < 50 ms.
  - Every limit violation names the asset, the limit and a fix. Examples: *"spr_boss is 100x100. DS sprites can be at most 64x64. Shrink it, or make it a Background."* and *"rm_game needs 18 colour sets on the top screen, but the DS has 16. Reduce spr_a or spr_b to 16 colours."*
  - Colour reduction is always a warning with preview data, never a failure.
  - The sample assets display correctly: a `dsdude screenshot` of a ROM built from them matches its golden PNG in `fixtures/assets/golden/` (checked with WS3's ROM). The cloud cannot run py-desmume or the real grit/mmutil, so WS0 generates that golden locally and owns the folder (section 3.4).
- **Can start immediately:** no. It starts at CP-A as a cloud session (`dsdude-ws5`), as in upgraded mode, and waits for a free cloud slot if usage limits bite; the standard fallback starts it in slot 3 after WS4. **Effort:** 2-4 weeks.
- **Isolation:** the quantizer and tiler are pure TS with golden bytes; tool wrappers skip when `ToolPaths` is empty. In the cloud: decode, quantizer, stitching, manifest, preview, budgets, E4xx and the cache.

### WS6 IDE shell
- **Goal:** the Electron application shell: main process, typed IPC, dockview layout, project tree, Monaco host, object editor, Output/Problems/meters, Play/Stop/Debug, settings, first-run wizard, import dialogs, the Learn panel host and the Controls card, working against `MockBuildService` until CP-B.
- **Owned paths:** `apps/ide/**` except `src/renderer/editors/**` and `electron-builder.yml`; `packages/ipc-contract/**` from the tag; `contracts/ipc.md`; `fixtures/ide/**` (including mock-host).
- **Depends on:** WS0; WS1's `BuildService` (wired at CP-B in hybrid and upgraded mode, on WS6's first day in the standard fallback); WS5's preview API.
- **Produces:** C5 (final) and C12 (panel API).
- **Consumes:** C1, C4, C5, C8, C9, C13.
- **Deliverables:**
  - **Electron skeleton.**
    - electron-vite 5 with CJS main/preload.
    - The BrowserWindow sets `sandbox: true` explicitly (electron-vite's template ships `sandbox: false`), plus contextIsolation.
    - CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:`.
    - `app://` is registered as standard, secure and supportFetchAPI before ready, with a `file://` fallback kept for the Phase-0 spike.
    - `setWindowOpenHandler` allows only dockview popouts.
    - `chokidar` 5 (ESM-only) is bundled, not externalised, and so is every `@dsdude/*` workspace package (TypeScript source, no JS build), through `build.externalizeDeps.exclude`. `apps/ide/package.json` has no `"type": "module"`, so main and preload build as CJS and the sandboxed preload is one self-contained file.
  - **Per-worktree dev setup.** The dev IDE calls `app.setPath('userData', path.join(DSDUDE_HOME, 'userData'))`, not `DSDUDE_HOME` itself, which also holds `emulators\` and `build\`; settings live in `settings.json` under userData (`%APPDATA%\DSDude` in the packaged app); electron-vite and Playwright use a per-worktree base port.
  - **Main-process plumbing.** A chokidar watcher, the utilityProcess build-worker host, typed IPC handlers with sender validation, and a zustand project store over `project-format`.
  - **Layout.** A dockview-react layout with:
    - the project tree and editor tabs;
    - a Monaco host, plain text until WS7's `packages/monaco-dss` lands;
    - Output (parsed C8), which drops `DSD|PAD|` lines and never steals focus from the emulator window when log lines arrive;
    - Problems (C9 with click-to-line). A failed Play shows a toast 'Fix 1 problem to play' and focuses Problems;
    - status-bar meters from C13 + the manifest, in plain language (section 1 step 5; hardware terms only in tooltips). They include a Sound memory meter, and red meters for dropped sprites or affine overflows reported by `DSD|STAT`.
  - **Object editor.**
    - A properties form, including Screen.
    - All of the object's event files are stacked in one scrollable panel: one Monaco model per file, under collapsible headers such as 'Step - runs every frame'.
    - The event list acts as a jump bar. "+ Add Event" creates the file with a one-line comment saying when the event runs.
    - 'Functions' is a fixed pseudo-event at the bottom of the list; it creates `functions.dss` on first click.
  - **Learn panel.** WS6 hosts a dockview panel and WS7 fills it.
    - It renders `docs/tutorial` and `docs/manual` markdown in-app, with copyable code, and opens on first launch.
    - It is the target of F1, of hover 'Learn more', and of every Problems entry's code link.
    - The Help menu has: Flappy Bird tutorial, Differences from GameMaker, Controls, and Tutorial assets, which opens the bundled `docs/tutorial/assets/` folder (WS7's files; packaging in section 3.4).
  - **Controls card.** An overlay on the first Play of each session:
    - The mapping: Arrows = D-pad, X = A, Z = B, S = X, A = Y, Q = L, W = R, Enter = Start, Shift = Select, click the bottom screen to touch.
    - The same mapping appears on a permanent Help > Controls page and as the first Output line of every launch.
    - A Settings page lets the user rebind. It writes both `melonDS.toml` and `desmume.ini` through WS1's EmulatorManager.
  - **New Project wizard.**
    - Templates come from `templates/index.json`. The Flappy Bird template is the finished sample, so the first Play happens within a minute of install.
    - The default location is `%USERPROFILE%\DSDudeProjects`, with a warning when the chosen path is under `%OneDrive%`.
  - **Import dialogs.** Sprite/sound import dialogs use the preview API, with an editable frame count, an animated preview and an origin picker.
  - **Play/Stop/Debug.** Debug also writes the GDB block and shows the attach command.
  - **First-run wizard.** It verifies the bundled tools pack and melonDS (SHA-256), offers the optional DeSmuME profile, and shows `dsdude doctor` results with fixes.
  - **Mock host and panel API.** `fixtures/ide/mock-host` and the EditorPanel API by CP-A.
  - **Playwright `_electron` smoke test** in fake-toolchain mode. It runs `electron-vite build` first, then `_electron.launch({ args: ['.'], cwd: path.resolve(import.meta.dirname, '..') })` from `apps/ide/tests/`, so it works from the worktree root and from `npm run -w apps/ide`, with the EnableNodeCliInspectArguments fuse left on for test builds.
  - **Cloud-stream support.** The `apps/ide` browser-test project stays runnable with `DSDUDE_SKIP_ELECTRON=1`, where no Electron binary exists, so the cloud streams WS7 and WS6b can test against it. At checkpoints WS6 checks WS7's Monaco glue and WS6b's editors (with the 60 fps checks) in the Electron IDE; failures go to WS0 as `IF-` entries.
- **Definition of done:**
  - The IDE opens `samples/flappy`, and edits and saves every resource type through `project-format`.
  - **IDE Play (the M0 IDE criterion, section 8):** Play boots `fixtures/runtime/hello/hello.nds` in melonDS through the real `BuildService` in `--skip-compile --skip-assets` mode, and the `DSD|LOG|hello` line appears in Output.
  - With `MockBuildService`, Play shows a fake log, and errors land in Problems.
  - The Controls card appears on first Play, and the Learn panel opens on first launch.
  - `electron-vite dev` and the Playwright smoke test run in a fresh worktree straight after `npm install`, and the smoke test is green.
  - The renderer has no access to Node APIs, and zod validates every channel.
- **Can start immediately:** yes, locally in slot 3 at the tag (hybrid, as in upgraded mode); the standard fallback starts it in slot 3 after WS5. **Effort:** 6-8 weeks (4-6 if WS6b takes the editors).
- **Isolation:** `MockBuildService` from the Phase-0 `api.ts` (fake logs, diagnostics, a fake emulator that waits), a fixture project and the fake toolchain.

### WS6b Visual editors (optional cloud session, usage-limit-gated; otherwise part of WS6)
- **Goal:** the sprite editor, room editor, background editor and sound panel as pure-function cores plus React views that run standalone in the mock host.
- **Owned paths:** `apps/ide/src/renderer/editors/**`, `packages/editor-core/**`, `fixtures/editors/**`.
- **Depends on:** WS6 (mock host + panel API at CP-A) and WS5 (preview API, frozen at CP-B).
- **Consumes:** C1, C6 (event names), C12, C13.
- **Deliverables:**
  - **`packages/editor-core`:** pure functions over `Uint8Array` index buffers + BGR555 palettes. Tools: pencil, fill, line, rect, select/move and mirror, plus onion skin, an animation strip, and undo via immer patches.
  - **Sprite view:** Canvas 2D, with `imageSmoothingEnabled=false` and `image-rendering: pixelated`.
  - **Room editor:** PixiJS 8 with `scaleMode 'nearest'`, showing both screens stacked like a real DS. Rooms use `layout: "separate"`, with a background per screen.
    - Instance placement, drag and delete.
    - A grid-snap paint mode for invisible `obj_wall` instances, for block platformers (section 1).
    - A view rectangle per screen, zoom/pan and a grid.
  - **Background editor** with a tile-count meter.
  - **Sound panel:** import, preview playback and loop points.
  - **Live limits** shown as meters.
- **Definition of done:**
  - A beginner builds `rm_game` with the mouse, and the room JSON round-trips.
  - Placing the 129th sprite-bearing instance on a screen shows a red meter, not a crash.
  - The room editor holds 60 fps at 4x zoom on a 1024x512 room with 200 instances (`@vitest/browser-playwright` check). In the cloud, WebGL is software-rendered, so this check only reports there; WS6 confirms it in the Electron shell.
  - Undo/redo works in the sprite and room editors.
  - Every editor core has Vitest coverage in node.
- **Can start immediately:** no. In hybrid mode it starts at CP-B as a cloud session (`dsdude-ws6b`), only if usage limits allow; it is the first stream dropped when they bite, and WS6 then builds the editors after the shell. In the standard and upgraded fallbacks it starts only in a local slot freed by a finished stream, and only if the memory gate allows; otherwise it is folded into WS6. **Effort:** 4-6 weeks.
- **Isolation:** editor cores are pure; views render in `fixtures/ide/mock-host` with `samples/flappy`. In the cloud: the editor cores in node, and the mock-host views in browser tests on headless Chromium (ports 5171-5179); integration into the Electron shell is checked locally by WS6.

### WS7 Learn: language service, docs, samples, templates
- **Goal:** make the product learnable: IntelliSense-grade editing for DSS, the generated reference, the manual with the GameMaker-to-DS mapping, the in-app Learn content, the Flappy tutorial, the samples and templates.
- **Owned paths:** `packages/language-service/**`, `packages/monaco-dss/**` (the Monaco glue, its own workspace package), `tools/gen-docs/**`, `docs/reference/**` (gen-docs is the only docs generator), `docs/manual/**` except `setup/`, `assets/` and `runtime-build.md`, `docs/tutorial/**` (with `docs/tutorial/assets/`), `samples/topdown-mini/**`, `samples/touch-paint/**`, `samples/minimal/**` and `samples/flappy/**` from M2, `templates/**` (with `templates/index.json` and `templates/library/`), `fixtures/language-service/**`, and the `doc`/`example` fields of `contracts/builtins.json` (section 3.4 shared-file rules).
- **Depends on:** WS0 (docs, templates, builtins-only completion); WS4 (C7 host API at CP-B, for scope-aware features); WS6 (the Learn panel and the Monaco host).
- **Consumes:** C1, C2, C6, C7, C9, C12, C13.
- **Deliverables:**
  - **Language support in the editor.**
    - In `packages/monaco-dss`: the Monarch tokenizer and language configuration for `dss`.
    - Providers over the C7 host API, running in a Web Worker: completion with snippets for events and patterns, hover with doc + example, signature help, definition, references, document symbols, folding and format.
    - Diagnostics debounced 150 ms via `setModelMarkers`.
    - A code action that applies the did-you-mean fix.
    - F1 on a builtin opens its reference entry in the Learn panel.
  - **Generated reference.**
    - `tools/gen-docs` produces `docs/reference/functions.md`, `variables.md`, `errors.md` (from the five catalogs of section 5 C9: project-format, compiler, assets, toolchain and runtime) and `limits.md`.
    - Doc and example text for every `builtins.json` entry marked `TODO(WS7)`. These are T0 changes that WS7 commits itself under the field-level shared-file rule of section 3.4 (only `doc`/`example` fields); WS0 merges them at the daily integration.
  - **Manual and tutorial.**
    - Manual chapters: Differences from GameMaker (with the concept map and the alias/unsupported list), Two screens and touch, Sprites and palettes, Rooms and views, and Sounds.
    - The Learn panel content.
    - `docs/tutorial/flappy-bird.md` with screenshots. It rebuilds the game from Empty.
    - The tutorial assets in `docs/tutorial/assets/`: `bird.png`, `pipe.png`, `gap.png`, `flap.wav`, `point.wav` and `hit.wav`, covering every sprite and sound the section 4 listing uses. WS8's installer bundles them (section 3.4).
  - **Samples and templates.**
    - `samples/topdown-mini`, `samples/touch-paint`, and `samples/flappy` from M2.
    - `templates/index.json`, the one registry the New Project wizard lists: Empty, Flappy Bird (the finished sample), Top-down, Touch paint and Platformer starter.
    - 3-4 CC0 tracker tracks and 8 CC0 effects for 'Add from library', in `templates/library/` with a `LICENSES.md` naming each source.
- **Definition of done:**
  - The Vitest suite over the service (no Monaco) covers completion in 20 cursor contexts and hover for every builtin.
  - The Monaco glue is tested in `@vitest/browser-playwright`.
  - In the IDE, typing `draw_` lists all draw functions with docs, and an unknown variable is underlined within 200 ms (checked locally by WS6 in the Electron IDE).
  - CI fails on stale generated docs.
  - Samples and templates compile with zero diagnostics, convert, and run at 60 fps on both emulators per `DSD|STAT`. Each template's `dsdude screenshot` passes its stated check. The conversion, emulator and screenshot parts run locally (WS0/WS8, the M4 template screenshots); failures come back as `IF-` entries.
  - The tutorial has been walked by a fresh Claude session; the M5 human walk-through (section 8) is closed out in a short WS7 session at M5.
- **Can start immediately:** no. In hybrid mode it starts at CP-A as a cloud session (`dsdude-ws7`), headless first, and waits for a free cloud slot if usage limits bite. The upgraded fallback starts it at CP-B; the standard fallback in slot 2 after WS2. **Effort:** 5-6 weeks (the language service is 2-3 weeks of it).
- **Isolation:** builtins-only features from `builtins.json` until the C7 host API lands; docs and templates need only `project-format`; the Monaco glue is tested in `@vitest/browser-playwright` on headless Chromium (after `npx playwright install chromium`; in the cloud on ports 5181-5189), and the Electron IDE is opened only locally, by WS6 and WS0 at checkpoints. In the cloud: gen-docs, the manual, templates, Monarch and completion.

### WS8 Integration, QA and release (inherits WS1's paths)
- **Goal:** own the end-to-end path: integrate stream outputs at each milestone, run cross-package and emulator tests, produce the installer and update channel, test on real hardware.
- **Owned paths:** WS1's paths, plus `tests/e2e/**`, `.github/**`, `apps/ide/electron-builder.yml`, `scripts/release.ps1`, `scripts/ci.ps1`, `CHANGELOG.md`, `docs/qa/**`.
- **Depends on:** WS1, WS2, WS3, WS4, WS5, WS6 (integration targets).
- **Consumes:** C4, C5, C8, C10.
- **Deliverables:**
  - **WS1 leftovers.** Whatever `docs/kickoff/ws8.md` lists: the tools pack, `dsdude doctor`, the DeSmuME-profile polish, and wiring `compileProject`/`packAssets` into `BuildService` for whichever had not landed at WS1's hand-off.
  - **`tests/e2e`.**
    - A CLI pipeline test: sample → `game.nds` → py-desmume 0.0.9 for 300 frames → screenshot compared against a golden PNG generated by py-desmume itself. py-desmume is pinned and runs headless with `SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy` and `cycle(with_joystick=False)`. Caveats (`docs/research/verification.md` claim 10):
      - Its bundled core is the SkyTemple DeSmuME fork reporting 0.9.12, not the 0.9.13 desktop build.
      - Fixture ROMs must be BlocksDS-built; devkitPro libnds-2 ROMs hang white in this core.
      - A hung ROM is detected from screenshot content, not `is_running()`.
      - Runners need the VC++ 2015-2022 x64 runtime.
    - A melonDS spawn with `DSD|` log assertions, a host-vs-melonDS trace diff, and the Playwright IDE smoke test.
  - **CI.** `scripts/ci.ps1` runs locally. WS8 may add GitHub Actions under `.github/**` on the private `origin`, using the BlocksDS docker image for the runtime and a Windows runner for the IDE; their cost on a private repo is a WS8 ADR.
  - **Installer and updates.**
    - electron-builder NSIS x64: `compression: maximum` and `npmRebuild: false`. `extraResources` holds the tools pack, melonDS 1.1, `runtime/dist`, the licenses, and the packaged content of section 3.4 (`templates/**` with `library/`, `docs/tutorial/**` with `assets/`, `docs/manual/**`, `docs/reference/**`). `electronFuses` is used for release builds only.
    - electron-updater via GitHub Releases, subject to the public-release decision by M6 (question 6).
    - The Corresponding Source archives go into the same GitHub Release (section 2.11).
  - **Release checks.** A license bundle; an offline clean Windows 11 VM install test (no MSYS2) as an M6 exit criterion; the M5 build (the installer on a Windows profile without MSYS2); a real-hardware checklist (Homebrew Menu / TWiLight Menu for argv[0]); integration reports at each checkpoint, with regressions filed to owners.
- **Definition of done:**
  - `npm run e2e` is green on this machine with both emulators.
  - The installer bundles the tools pack and melonDS 1.1, with the GPL-3 text and the 1.1 source archive in the same GitHub Release. The first-run wizard therefore only verifies them (SHA-256) and offers the optional DeSmuME profile. Downloads are used only for emulator updates.
  - The installer installs on a clean Windows 11 VM/profile, offline install included, and the Flappy sample plays.
  - The download page documents SmartScreen's 'More info → Run anyway' unless an Authenticode certificate is budgeted.
  - The release notes and the license bundle required by section 2.11 are included (license texts, SHA-256s, Corresponding Source).
  - The sample is verified on a real DS if a flashcart exists; otherwise the release notes say it is untested on hardware.
- **Can start immediately:** no. In hybrid mode (as in upgraded mode) it takes over local slot 1 from WS1 at CP-C (M1), with WS1's leftovers. The standard fallback starts it in slot 1 after WS3. **Effort:** in hybrid mode, part-time weeks 3-6, then full-time to release (~week 12-14); in the upgraded fallback the same to ~week 12; in the standard fallback, full-time from its start to release.
- **Isolation:** fake toolchain for IDE tests; BlocksDS-built fixture ROMs for emulator tests.

## 7. Parallel kickoff plan

### 7.1 Phase 0 (days 0-2, WS0 plus WS1 from hour zero)

Phase 0 is minimum-viable. It produces what the streams need to start in isolation and leaves everything else to the stream that will write it best. WS0 is a Claude Code instance (section 7.2), and the user approves its work at the end of each day. Only WS0 and WS1 run during Phase 0, in every operating mode; the one cloud session before the tag is the Day-1 probe.

**Day 0 (user, ~1 h plus the GitHub and cloud setup, and ~30 min present for the install).**
- Answer the questions due on Day 0 (section 10): the private GitHub `origin` and the Claude GitHub App (question 2), and the usage limits (question 3, needed before the tag). Write the answers into the Day-0 answers line of WS0's start prompt (`docs/kickoff/ws0.md`). Launching WS1 and approving its prompts gives the install consent (question 1).
- Make the repo in place (section 2.10). `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` already holds `PLAN.md`, `CLAUDE.md`, `docs/kickoff/**` and `docs/research/**`. In Windows PowerShell 5.1, the block below sets the repo config shared by all worktrees (section 3.4) and writes a minimal `.gitignore` before the first commit, because `mwccarm` is proprietary and must never reach GitHub. It then moves `mwccarm\` to `vendor\mwccarm\` and `dsd-windows-x86_64.exe` to `vendor\dsd\`, and commits the documents so `git worktree add` has a base:

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

`/dist/` and `/build/` are root-anchored because `runtime/dist/**` and `fixtures/build/**` are tracked. `-ErrorAction Stop` matters because a `Move-Item` error is otherwise non-terminating in Windows PowerShell 5.1, so a file held open by another program would stay at the root; the root-level `/mwccarm/` and `/dsd-windows-x86_64.exe` ignore lines are the second line of defence. `.claude/settings.local.json` holds each instance's own "don't ask again" answers (section 3.4).

- Create the private GitHub repo and push `main`. This is the user's outward-facing action; no instance does it. `gh` is not installed, so pick one route:

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

- Install the Claude GitHub App at `https://github.com/apps/claude/installations/new` with **Only select repositories** set to `dsdude`. GitHub grants it read/write access to Actions, Contents, Issues, Pull requests, Workflows and more, with no subset. `/web-setup` alone is not enough: without the App, `claude --cloud` uploads a bundle instead of cloning.
- Create the five cloud environments (section 7.5, "One-time setup"). This may slip to Day 1, as long as it happens before the probe.
- Launch WS0, then WS1, whose worktree `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1` exists from then on. WS1 runs the install below step by step from a background Node script (`docs/kickoff/ws1.md` task 1), because a foreground tool call is killed after 2 minutes by default (10 at most):

```powershell
# WS1 (instance 2), hour zero, user present. Bootstrap from the tarball: no UAC prompt, no side effects on the user's MSYS2.
if (-not (Test-Path C:\msys64\usr\bin\bash.exe)) { throw 'MSYS2 not found at C:\msys64' }
$ProgressPreference = 'SilentlyContinue'   # Windows PowerShell 5.1's progress bar slows downloads badly
New-Item -ItemType Directory -Force C:\msys64\tmp | Out-Null
Invoke-WebRequest -UseBasicParsing https://wonderful.asie.pl/bootstrap/wf-bootstrap-windows-x86_64.tar.gz -OutFile C:\msys64\tmp\wf-bootstrap.tar.gz
$env:MSYSTEM='UCRT64'; $env:MSYS2_PATH_TYPE='inherit'; $env:CHERE_INVOKING='1'; $env:PATH="C:\msys64\opt\wonderful\bin;$env:PATH"
$env:BLOCKSDS='/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT='/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN='/opt/wonderful'
$bash = 'C:\msys64\usr\bin\bash.exe'
& $bash -lc 'mkdir -p /opt/wonderful && tar -xzf /tmp/wf-bootstrap.tar.gz -C /opt/wonderful'; if ($LASTEXITCODE) { throw 'extract failed' }
# run 1 only upgrades wf-pacman itself and exits 0, so loop until wf-config exists
for ($i = 1; ($i -le 3) -and -not (Test-Path C:\msys64\opt\wonderful\bin\wf-config); $i++) { & $bash -lc 'wf-pacman -Syu --noconfirm wf-tools'; if ($LASTEXITCODE) { throw "wf-pacman run $i failed" } }
if (-not (Test-Path C:\msys64\opt\wonderful\bin\wf-config)) { throw 'wf-tools not installed' }
& $bash -lc 'wf-config repo enable blocksds && wf-pacman -Syu --noconfirm && wf-pacman -S --noconfirm blocksds-toolchain blocksds-docs'; if ($LASTEXITCODE) { throw 'BlocksDS install failed' }
& $bash -lc 'cd $BLOCKSDS/examples/graphics_2d/bg_regular_nitrofs && make'
Invoke-WebRequest -UseBasicParsing https://github.com/melonDS-emu/melonDS/releases/download/1.1/melonDS-1.1-windows-x86_64.zip -OutFile $env:TEMP\melonDS.zip
if ((Get-FileHash $env:TEMP\melonDS.zip).Hash -ne '9F3F8A244103BE20B5B657AF5B0ED1B2A66BB20A7181476A6D294C9A53D4F8C8') { throw 'melonDS hash mismatch' }
New-Item -ItemType Directory -Force C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude\emulators | Out-Null   # WS1's DSDUDE_HOME
Expand-Archive $env:TEMP\melonDS.zip C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude\emulators\melonDS-1.1
python -m pip install --user py-desmume==0.0.9; if ($LASTEXITCODE) { throw 'py-desmume install failed' }   # headless screenshots (spike 7)
& C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude\emulators\melonDS-1.1\melonDS.exe C:\msys64\opt\wonderful\thirdparty\blocksds\core\examples\graphics_2d\bg_regular_nitrofs\bg_regular_nitrofs.nds
```

Inner bash strings use single quotes and no double quotes, because Windows PowerShell 5.1 mangles double quotes in native arguments. The toolchain counts as installed when both `C:\msys64\opt\wonderful\bin\wf-config` and `C:\msys64\opt\wonderful\thirdparty\blocksds\core\tools\ndstool\ndstool.exe` exist. Once the example ROM shows its background, the toolchain question is settled. melonDS lives in WS1's `DSDUDE_HOME`, so its toml stays in that worktree; WS1 closes the window (`taskkill /IM melonDS.exe`, then `/F` after 2 s) before spike 2. `python` is the Microsoft Store CPython 3.13, and py-desmume goes into its user site, which every worktree shares.

WS1 then:
- builds `samples/hello` and checks it with `packRom()`'s header check;
- boots it in melonDS and DeSmuME from Node, spawned without `windowsHide`;
- captures `DSD|LOG|hello` and takes a `dsdude screenshot`;
- copies `arm9.elf` + `hello.nds` into `fixtures/runtime/hello/`.

Together these make up the `toolchain-ok` gate (section 8).

**Day 1 (WS0).**
- The monorepo, with the whole pinned stack of section 2.5 installed into the right packages (root `"postinstall": "node tools/postinstall.mjs"`, which runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1`) and `vitest.config.ts` using `test.projects`. `package-lock.json` is generated on Windows under the lockfile rules of section 3.4.
- `.gitattributes`, `.editorconfig`, `.npmrc`, the full `.gitignore` (it replaces Day 0's and keeps `vendor/*` with `!vendor/README.md`), and `biome.json` with `formatter.lineEnding: "lf"`.
- Three git hooks.
  - `.githooks/pre-commit` runs Biome and the ownership check, reading the stream from `git config --worktree dsdude.ws`.
  - `.githooks/commit-msg` adds the trailer with `git interpret-trailers --in-place --if-exists doNothing --trailer "DSDude-WS: WSn"`, enforces the lockfile rule, and runs `tools/check-lockfile.mjs` when the lockfile is staged.
  - pre-commit and commit-msg both skip merge commits (section 3.4).
  - `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`) or any `mwccarm/`, `license.dat` or `dsd-*.exe` path, anywhere in the pushed history (the hook is in `docs/kickoff/ws0.md` task 3).
- Shared tools:
  - `tools/ownership.json`, with the shared-file rules and tag-based `from`/`until` rows of section 3.4;
  - `tools/check-ownership.ts`, which reads `origin/main` when `CLAUDE_CODE_REMOTE=true` or there is no local `main`;
  - `tools/check-lockfile.mjs` and `tools/adr-pending.ts`;
  - `tools/memsampler.ps1`, started on Day 1 and left running (section 7.2);
  - the Day-1 part of `tools/checkpoint.ps1`: `-MemoryOnly` prints the minimum available memory and the peak commit charge since a given time and restarts a stale sampler, and `-AdrOnly` runs `tools/adr-pending.ts`. Every run warns when `OneDrive.exe` is running and the repo path is under `%OneDrive%` (risk 10). The merge steps follow by the end of D+1.

  Before the local launches at the tag, WS0 runs `tools/checkpoint.ps1 -MemoryOnly` for the memory gate. WS1's hour-zero launch is exempt, because the sampler starts on Day 1.
- `.claude/settings.json` with the shared permission allowlist and a deny rule for `npm ci`, in WS0's first commit (task 1), so the rest of Day 1 needs fewer permission prompts.
  - For cloud sessions it adds a SessionStart hook (`startup|resume`) that runs `node tools/cloud/session-start.mjs`.
  - It also adds allow rules for `bash tools/cloud/*`, `make -f runtime/Makefile.host *`, `runtime/build-host/dsdude-host *`, `./runtime/build-host/dsdude-host *`, `timeout *`, `node tools/*`, `npx playwright install chromium`, `git fetch *`, `git merge origin/*`, `git restore package-lock.json`, `git config core.hooksPath .githooks`, `git config core.autocrlf false` and `git config dsdude.ws *`.
  - The `pacman`/`wf-pacman` deny rules are added in the tag commit, after WS1's install and spike 4 (WS1's hour-zero exception).
- The cloud pieces of section 7.5:
  - `tools/cloud/session-start.mjs`;
  - `tools/cloud/lib.sh`, `start.sh` and `push.sh`, committed LF with `--chmod=+x`;
  - the registry `docs/status/cloud.md`;
  - `docs/status/wsN.md` stubs for WS2-WS8 and WS6b, each a title plus the closing `## Integration feedback` heading. WS1 creates `docs/status/ws1.md` at hour zero without the heading; WS0 appends the heading on `main` right after its first merge of `ws1-toolchain`.

  WS0 pushes them to `origin/main` before the probe.
- Empty-but-green skeletons for every workspace package. Each has a `src/index.ts` exporting interface types, one passing test, and a `CLAUDE.md` brief of at most 60 lines (owner, owned paths, contracts, test command, isolation strategy), generated by `tools/phase0/gen-briefs.ts`.
- Small contracts: `diagnostics.md`, `runtime-limits.json` (section 5 C13), `log-protocol.md` (section 5 C8), a `cli.md` draft, and `ipc.md` with the channel list and zod stubs.
- `packages/toolchain/src/api.ts` with `MockBuildService`, and the preview types in `packages/asset-pipeline/src/preview.ts` (section 5 C4).
- C1: `project-format.md` + zod + load/save (no migrations until a v0 project exists), plus `samples/minimal` and `samples/flappy` v0 with script-generated PNGs, and `docs/adr/0001-flappy-pipe-geometry.md` (section 4).

**Cloud probe (Day 1, before the tag).** Once the cloud pieces are on `origin/main`, the user opens one cloud session and pastes the probe below. The session uses environment `dsdude-ws4`, branch `main` and mode Auto.

> DSDude cloud probe, requested by the user. Change no tracked file on main; report one line per item.
> 1. `check-tools`; `node -v` in a fresh Bash call; `npm -v`, `gcc --version`, `make --version`; `echo $CLAUDE_CODE_REMOTE $DSDUDE_WS`.
> 2. `git rev-parse --is-shallow-repository`, `git branch -a`, `git tag`, `git config --get-all remote.origin.fetch`.
> 3. `git config dsdude.ws` (did the SessionStart hook set it?); then `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS4`; then `bash tools/cloud/start.sh`, then `npm run check && npm test`.
> 4. Make an empty commit. Did it get a `DSDude-WS:` trailer?
> 5. Push it to `HEAD:refs/heads/probe-plain`, then `HEAD:refs/heads/claude/probe-named`, then your own branch; give each exit code and error.
> 6. `curl -sI https://cdn.playwright.dev`, `curl -sI https://playwright.download.prss.microsoft.com`, `curl -sI https://api.github.com` and `curl -sI https://raw.githubusercontent.com` (status and `x-deny-reason`); then `npx playwright install chromium`.
> 7. Which permission modes are offered?

WS0 then:
- records the results in `docs/status/ws0.md` ("Cloud probe");
- records the working push order in the `CLAUDE.md` Status block;
- deletes the probe branches with `git push origin --delete ...`;
- fixes the environments or `push.sh` if anything failed.

If step 3 fails, the cloud streams due at the tag wait under the fallback rule of section 7.2.

**Day 2 (WS0).**
- `contracts/language.md` v0.1: EBNF, precedence, optional semicolons, the number rules of section 2.8, truthiness, `with`/`other`, arrays, and the scope rules of section 4.
- `contracts/events.md`: the events, frame order and inheritance of section 4, and the collision rules of section 3.3.
- The minimal C2: container, cells, calling convention, event ids, `.dsda` grammar, and `contracts/opcodes.json` with the 29 stable opcodes listed in section 5 C2.
- `contracts/builtins.json` covering all ~90 builtins: name, kind, params, returns, category, `allowedEvents`, `pure` and min/max args. Doc and example text only for the ~30 used by Flappy; the rest are marked `TODO(WS7)`.
- `tools/gen-builtins.ts` and `tools/gen-opcodes.ts`, with a byte-identical CI check.
- Table-driven `packages/dsdb`, with `fixtures/bytecode/hello.dsda` → `hello.dsdb` round-tripping, and `tools/gen-dsdb.ts`, which regenerates every committed `fixtures/**/*.dsdb` from its `.dsda`.
- `tools/phase0/make-fixtures.ts`, which writes the `fixtures/assets/` PNGs and WAV.
- Conformance v0: 5 pure-computation programs with expected `DSD|LOG` output.
- `docs/kickoff/wsN.md` completed for every stream (section 7.5), with a "Cloud setup" block in each cloud kickoff.
- `git tag -a phase0 -m 'phase0'`, then `git push origin main --follow-tags`. Event tags are annotated so that `--follow-tags` carries them.

**Deferred, with owners.**

| Item | Owner and deadline |
|---|---|
| C7 `LanguageServiceHost` | WS4, by CP-B |
| C3 `contracts/assetpack.md` | WS5, on its first day, from section 2.9 and section 5 C3 |
| C11 `dsd_platform.h` | WS2, by CP-A |
| C12 panel API + `fixtures/ide/mock-host` | WS6: CP-A in hybrid and upgraded mode; in the standard fallback, the late-start freeze rule of section 7.3 |
| `samples/hello`, `fixtures/runtime/hello/**`, `fixtures/build/**` | WS1, at `toolchain-ok` |
| XM fixture | WS5 |
| `fixtures/bytecode/bench.dsda` | WS2 |
| Conformance programs 6-10 | WS4 |
| Builtin docs and examples | WS7 |
| `project-format` migrations | WS0, when first needed |
| Full `packages/ipc-contract` | WS6 |

**The fan-out gate is `git tag phase0`.** It requires the minimum-viable Phase-0 contracts committed, `npm test` green, and the cloud pieces on `origin/main`. It also requires either a green probe step 3 or a recorded fallback. Section 8 has the full criteria.

`hello.nds` booting from `dsdude play` is a separate gate, `toolchain-ok`, owned by WS1. That gate releases only WS3, into slot 2 and not before the tag; in the standard fallback, WS3 also waits for a free slot (section 7.2). WS2, WS4, WS5, WS6, WS7 and WS6b work host-only or against mocks.

The budget is 2 days. If day 3 ends without the tag, WS0 tags `phase0` on main's last green commit anyway, so the ownership rows activate. It lists the missing items in `docs/status/ws0.md` and `contracts/README.md` and delivers each as an ADR (ADR-0002 onward) within 48 hours. The user then launches the streams due at the tag: WS6 locally, and WS2 and WS4 as cloud sessions (section 7.2).

**Phase-0 spikes.** These settle the residual risks recorded in `docs/research/verification.md`. Each result goes into the owner's `docs/status/wsN.md`; a failure becomes an ADR. Spikes that need MSYS2, BlocksDS, an emulator or Electron run locally, even when a cloud stream shares them.

| # | Spike | Settles | Who, when |
|---|---|---|---|
| 1 | Git hygiene (`tools/phase0/spike1-hooks.ps1`). From a throwaway worktree, a legitimate commit passes and carries the `DSDude-WS:` trailer; a foreign-path commit and a stray `package-lock.json` are rejected; a `git merge main` that brings a regenerated `package-lock.json` and another stream's files succeeds without `--no-verify`, with and without a conflict. A push to a scratch bare repo of a history with a file under `vendor/` is refused by `pre-push`, also when the file was committed and then untracked again. Makefiles and `.githooks/*` check out LF, and one allowed and one denied Claude Code command behave as configured. | risk 19 | WS0, day 1 |
| 2 | Spawn melonDS 1.1 from Node with and without `windowsHide`, then check `IsWindowVisible`. | claim 6 | WS1, day 0-1 |
| 3 | Run `bash.exe -lc pwd` from Node with `SHLVL` removed, with and without `CHERE_INVOKING=1`. | claim 2 | WS1, day 0 |
| 4 | Drive the install above from Node. Record wf-tools run 1 and run 2, check `arm-none-eabi-gcc --version` = 16.2.0 and that `ndstool -V`/`grit -V`/`mmutil -V` report v1.24.0, and confirm that the second `-Syu` triggers no further core update. | claim 1 | WS1, day 0-1 (user present) |
| 5 | Tools pack: objdump import walk; the 4 DLLs next to the exes in a path with spaces; clean-PATH run; 0xC0000135 from ndstool/grit without the DLLs; every DLL imports `api-ms-win-crt-*`, not `msvcrt.dll`. | claim 7 | WS1 before its hand-off if time remains, otherwise WS8 (WS1 leftover) |
| 6 | Run `make VERBOSE=1` from Node with the section 6 WS1 env in `examples/maxmod/nitrofs` and `graphics_2d/bg_regular_nitrofs`. | claim 2 | WS1, day 1 |
| 7 | py-desmume with `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy` on the 1.24.0 SDK ROMs: 300 frames, then read the screenshot back. | claim 10 | WS1, day 1-2 |
| 8 | `samples/hello` log path. Check the protocol chosen from `0x04FFFA00`, the >= 5 KB flush pad of `DSD|PAD|` lines (each <= 1023 chars), a 300-char line and a line containing `%`. Measure latency with and without the pad, check for duplicates on melonDS, and confirm that a graceful `taskkill /PID` flushes the tail. | claim 6 | WS1, `toolchain-ok` |
| 9 | NitroFS. Check the header offsets and magic, repack timing, and an empty `-d` folder. Boot in melonDS, in DeSmuME (default settings and `--slot1 R4 --slot1-fat-dir`) and in py-desmume. | claim 3 | WS1, `toolchain-ok` |
| 10 | Graphics. Run the corrected grit lines, then a ROM with the section 3.3 bank table, 128-byte-aligned frames and the UI layer. Compare screenshots with the source PNGs. | claim 5 | WS3, first week |
| 11 | Audio. A WAV with a `smpl` loop plus an XM go through mmutil (attached `-o`/`-h`); a ROM logs every maxmod return code; `mmutil -V` must match libmm9. | claim 9 | WS3, first week, both sides in hybrid mode (WS5's cloud session has no mmutil). Fallback modes: WS3 with WS5; in the standard fallback WS3 runs the ROM side in its first week and WS5 repeats the mmutil side on its first day |
| 12 | Numeric harness hashes: host (`-O0`, `-O2`, trap) against an ARM9 ROM on melonDS. | claim 11 | WS2 + WS3, by CP-C; in hybrid mode WS3 runs it locally |
| 13 | Front-end. Install the pinned stack with `install-electron` in a fresh worktree and check that composite `tsc -b` catches an injected error. Then mount Monaco 0.57 through its 0.56+ entry points in a `sandbox: true` window with the CSP, render dockview-react, and run Playwright `_electron.launch` after the build. | claim 8 | Install and `tsc -b`: WS0, day 1. The rest: WS6 on its first day (WS0 in week 1 in the standard fallback). |
| 14 | M1 microbenchmark variants: a 4 KB straight-line block against a cache-resident loop, tagged against int-specialised opcodes, and `-mlong-calls` against BL. Run on melonDS (JIT off) and DeSmuME, and add a 1 MB NitroFS read and `.itcm`/`.dtcm` usage. | claim 4 | WS2 + WS3, at M1; in hybrid mode WS3 runs it locally |
| 15 | Hardware, only if a flashcart exists. Via Homebrew Menu or TWiLight Menu, run hello, the numeric harness, the VM benchmark and the scanline page. This calibrates the melonDS derating, sets `scanlineObjCycles` and reads `0x04FFFA00` on real hardware. | claims 4, 13 | user + WS3, when a cart is available |

### 7.2 Operating modes, stream waves and the WS0 role

**Machine facts (measured 2026-09-25).**
- 11.3 GB usable RAM: 8 GB + 4 GB DDR4-3200 SO-DIMMs, both slots full, board maximum 64 GB.
- 16 threads (Ryzen 7 5825U).
- One Claude Code instance uses ~350 MB working set and ~600 MB private memory, growing with context.
- Background apps use ~3 GB: browser ~1.5 GB, plus Discord, Dropbox, Creative Cloud and Defender.
- With one Claude session and those apps running, 3.2 GB was free and the commit charge was 14.6 of 24.8 GB, so the page file is already in use.
- During planning, Claude Code killed one background command for low system memory.

**Operating mode: hybrid (user decision, 2026-09-25).**
- Streams that need Windows tools run locally, within the standard-mode limits.
- Streams that can run headless on Linux run as Claude Code cloud sessions on the private GitHub repo. They use no local RAM.
- Every kickoff file assumes hybrid mode. Standard and upgraded mode are kept below only as fallbacks.

**Rules for local instances (every mode).**
- WS0 counts toward the local instance cap; cloud sessions do not.
- Every `CLAUDE.md` states the per-instance limits:
  - `vitest run --pool=threads --maxWorkers=2`, with no watch mode;
  - `make -j4` for runtime builds while more than two stream instances are active (always, in hybrid and standard mode). `buildRuntime({jobs})` defaults to 8; the kickoff env block and the cloud environments set `DSDUDE_MAKE_JOBS=4`, and `dsdude` also takes `--jobs N`;
  - close the dev IDE and the emulator after each test;
  - WS7 and WS6b test their UI with `@vitest/browser-playwright` (after `npx playwright install chromium`). The Electron IDE shows that UI only locally, when WS6 or WS0 checks it at checkpoints.
- At most one Electron dev IDE runs machine-wide. Before opening a dev IDE or an emulator window, an instance runs `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue`. If the limit is already reached, it waits or uses `dsdude screenshot` headless.
- **Memory gate.** `tools/memsampler.ps1` runs continuously from Phase 0 day 1 (`Get-Counter '\Memory\Available MBytes','\Memory\Committed Bytes'`, once a minute) and appends to `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\memsampler.log`. `tools/checkpoint.ps1` summarises the minimum available memory and the peak commit charge since the last checkpoint from that log. A local instance is added only if minimum available memory stayed above 1.5 GB.
- Per-package `CLAUDE.md` briefs stay at most 60 lines, so a compaction does not reload the full `PLAN.md` (~55K tokens).

**Hybrid mode.**
- **Local limits** are the standard-mode ones:
  - at most 4 local Claude Code instances: WS0 plus slots 1-3;
  - at most one Electron dev IDE and one emulator window machine-wide;
  - the memory gate before every local launch.
- **Background apps:** Discord and Creative Cloud stay closed. One claude.ai/code tab is allowed for steering cloud sessions; the mobile Code tab or the CLI also work.
- **Cloud:** one session per stream, each in its own environment `dsdude-wsN`, working on the stream line `wsN-<name>` (section 7.5).

| Stream | Where | Starts | Why there |
|---|---|---|---|
| WS0 lead/integrator | local, `main` in the repo root | Day 0 | Runs `tools/checkpoint.ps1`, the MSYS2 host goldens, the BlocksDS runtime build, `dsdude screenshot` (py-desmume) and the emulators. Integrates local and cloud branches. |
| WS1 toolchain/Play | local, slot 1 | hour zero | Installs BlocksDS into `C:\msys64`; emulators; Windows process spawning. |
| WS3 DS platform | local, slot 2 | `toolchain-ok`, not before the tag | BlocksDS DS build, selftest ROM, emulator checks. |
| WS6 IDE shell | local, slot 3 | tag | Electron on Windows: spawn, paths, NSIS behaviour. |
| WS8 release | local, slot 1 after WS1 | CP-C (M1) | NSIS installer, clean-VM test, e2e with emulators. Takes WS1's leftovers. |
| WS2 runtime core | cloud, `dsdude-ws2` | tag | Host build with Linux gcc. `runtime/Makefile.host` must build with both MSYS2 UCRT64 gcc (WS0's integration) and Linux gcc, with identical flags `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char`. WS3 and WS0 check the DS-side compile of the core locally. |
| WS4 compiler | cloud, `dsdude-ws4` | tag | Pure TypeScript; fully cloud. |
| WS5 asset pipeline | cloud, `dsdude-ws5` | CP-A (D+3) | Pure-TS parts: decode, quantizer, stitching, manifest, preview, budgets. The real grit/mmutil tests skip when `ToolPaths` is empty. WS0's local integration runs them with the local BlocksDS tools and reports failures back. |
| WS7 learn | cloud, `dsdude-ws7` | CP-A (D+3) | Headless first: gen-docs, templates, Monarch tokenizer, builtins-only completion, manual. The Monaco glue is tested with `@vitest/browser-playwright` in headless Chromium. Only WS6 or WS0 opens the Electron IDE, locally. |
| WS6b editors (optional) | cloud, `dsdude-ws6b` | CP-B (D+7) | Only if usage limits allow; otherwise WS6 builds the editors after the shell. `packages/editor-core` pure functions, plus views rendered in `fixtures/ide/mock-host` with browser tests. WS6 checks the integration into the Electron shell locally. |

| When | Slot 1 | Slot 2 | Slot 3 | Cloud | Local / cloud |
|---|---|---|---|---|---|
| Day 0 | WS1 | - | - | probe on Day 1 | 2 / 0 |
| Tag D (day 2) | WS1 | waits for `toolchain-ok` | WS6 | WS2, WS4 | 3 / 2 |
| `toolchain-ok` (day 1-3; WS3 not before the tag) | WS1 | WS3 | WS6 | WS2, WS4 | 4 / 2 |
| CP-A (D+3) | WS1 | WS3 | WS6 | + WS5, WS7 | 4 / 4 |
| CP-B = M0 (D+7) | WS1 | WS3 | WS6 | + WS6b | 4 / 5 |
| CP-C = M1 (D+14) | WS8 | WS3 | WS6 | unchanged | 4 / 4-5 |
| Later | WS8 | free after WS3's DoD, for short local fix sessions | WS6 | streams end at their DoD | max 4 / 5 |

At CP-C, WS1 commits its last work, WS0 merges it and tags `start-ws8`, and slot 1 continues as WS8 with WS1's leftovers (section 7.5).

Hybrid uses upgraded mode's milestone criteria: M0 includes IDE Play and the selftest ROM. It also uses upgraded mode's checkpoints (CP-A D+3, CP-B D+7, CP-C D+14, then weekly; section 7.3), its freezes and its ownership events. The standard-mode `cp-b` holding row for WS1's paths is not created.

**Hybrid calendar:** M0 week 2, M1 week 3, M2 week 4-5, M3 week 6-7, M4 week 8-9, M5 week 10-11, release 0.1 around week 12-14 (section 8).

**Usage limits.**
- Peak concurrency is ~4 local + 4-5 cloud sessions on one Claude plan.
- The user confirms that the plan covers this before the tag (question 3). WS0 asks again at each checkpoint.
- If limits bite, drop WS6b first; WS6 then builds the editors. Next, WS7 and WS5 wait for a free cloud slot.

**Cloud streams in git.**
- **Launch.** WS0 runs `git tag -a start-wsN -m 'launch WSn'; git push origin main 'start-wsN^{commit}:refs/heads/wsN-<name>' --follow-tags`, which creates the stream line on `origin` without a local branch of that name. It then adds the stream's line to the registry `docs/status/cloud.md` and tells the user to launch.
- **First command.** Repo-local git config is not cloned, so every cloud session first runs `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn`. `tools/check-ownership.ts` reads `origin/main` when there is no local `main`.
- **The rest** (pushing with `push.sh`, the daily merge of `origin/main`, resuming an ephemeral session) is in section 7.5. The per-commit ownership check (the `DSDude-WS:` trailer) applies exactly as for local branches.

**Fallback.** WS0 records a switch to standard mode in the `CLAUDE.md` Status block, and re-plans at the next checkpoint, when any of these happens:
- GitHub or cloud sessions are unavailable for more than a day;
- every push target is refused;
- staggering cannot absorb the usage limits.

A cloud stream then continues locally with `git fetch origin; git worktree add -B wsN-<name> ..\DSDude-wsN origin/<push target>`, followed by the usual worktree setup (`docs/kickoff/README.md` section 3). After a RAM upgrade, upgraded mode applies: the local cap becomes 8, and cloud streams may move home the same way.

**Standard mode (fallback: today's 12 GB, no cloud sessions).**
- At most 4 Claude Code instances at once: WS0 plus 3 stream instances.
- At most one Electron dev IDE and at most one emulator window machine-wide.
- Close the browser, Discord and Creative Cloud during sessions.
- Streams run in three slots. When a stream reaches its hand-off point, it commits and updates `docs/status/wsN.md` with its leftovers. WS0 merges, then a fresh instance starts the next stream in that slot from its kickoff file.

| Slot | Streams in order | Hand-off points (approximate) |
|---|---|---|
| 1 | WS1 (hour zero) → WS3 → WS8 | **WS1 → WS3 at M0 (~week 2)**, once `packRom()`, `EmulatorManager`, log capture, `BuildService` and `dsdude screenshot` work. `dsdude doctor`, the tools pack, DeSmuME-profile polish, and wiring `compileProject`/`packAssets` into `BuildService` for whichever has not landed move to WS8. **WS3 → WS8 after M1 (~week 5-6)**, once the platform layer, selftest ROM, timer harness and `npm run build:runtime` are done. The M4 stress check and hardware notes move to WS8. |
| 2 | WS2 (tag) → WS7 | **WS2 → WS7 (~week 5-6)**, when WS2's definition of done is met. |
| 3 | WS4 (tag) → WS5 → WS6 | **WS4 → WS5 after M1 (~week 5)**, so WS4 is still there to emit int-specialised opcodes if the M1 gate needs them. **WS5 → WS6 (~week 8)**, when `dsdude assets` meets its definition of done. WS6 builds the visual editors itself (WS6b is folded in). |

WS6's Electron work starts after the pipeline exists, so WS6 wires the real `BuildService` on its first day. WS7 starts before WS6 in standard mode, so it works headless (Vitest, `@vitest/browser-playwright`, docs and templates) until WS6 delivers the C12 panel API and the Learn panel host. When WS7 finishes (~week 12), slot 2 may run WS6b on the editors if WS6 is still busy and the memory gate allows. **Resulting calendar:** M0 week 2, M1 week 4-5, M2 week 7-8, M3 week 11-12, M4 week 14-16, M5 week 15-17, release 0.1 around week 16-20 (section 8).

**Upgraded mode (fallback after a RAM upgrade to 32 GB, e.g. 2 x 16 GB DDR4-3200 SO-DIMM).** WS0 plus up to 7 local stream instances start in memory-gated waves:

| When | Starts | Instances incl. WS0 |
|---|---|---|
| Hour zero | WS0, WS1 | 2 |
| Tag (D, Phase 0 day 2) | WS2, WS4, WS6 (the only Electron stream until CP-C) | 5 |
| WS1's `toolchain-ok` (not before the tag) | WS3 | 6 |
| CP-A (D+3) | WS5 | 7 |
| CP-B (D+7) | WS7, headless first | 8 |
| CP-C (D+14) | The WS1 instance becomes WS8 | 8 |
| Later | WS6b, only in a slot freed by a finished stream and only if the gate allows. Otherwise WS6 builds the editors after the shell. | 8 |

Upgraded mode allows at most one Electron dev IDE machine-wide and one emulator per worktree. The calendar is the original one: release 0.1 around week 12.

**WS0.** WS0 is a persistent Claude Code instance on `main` in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`. It writes Phase 0, integrates the local and cloud stream branches daily with `tools/checkpoint.ps1`, and drafts every ADR with a recommended answer. The local repo stays the source of truth. Integration itself never needs GitHub; only the cloud streams' fetches and pushes do.

The integration run:
- fetches `origin` and picks the refs: `wsN-<name>` for local streams, `origin/<push target>` for cloud streams (section 7.3);
- merges them in dependency order with `--no-ff`: WS1/WS8, WS4, WS2, WS3, WS5, WS6, WS6b, WS7, wherever each runs. The merges happen on a throwaway `integrate` branch, and `main` moves only when the suite is green (section 7.3);
- enforces `tools/ownership.json` per commit: each non-merge commit in `main..<ref>` is checked against the table at main's HEAD for the stream in its `DSDude-WS:` trailer (section 3.4; without one, the branch's stream, or the registry's for a cloud ref), and a violation refuses the merge;
- regenerates the lockfile when a `package.json` changed: `npm install`, then `node tools/check-lockfile.mjs`, committed as `chore(deps): regenerate lockfile`;
- runs `npm run check && npm test` on Windows (separators, CRLF, case, spawning) and the MinGW host goldens. For each merged cloud stream it also runs the local-only checks of section 7.5;
- runs `dsdude play samples/hello` headless via `dsdude screenshot`;
- reports each failure that only a local run finds (real grit/mmutil, MSYS2 gcc, the DS build of the core, emulators, Electron). It appends an entry to the owning stream's `docs/status/wsN.md` on `main`, in the form ``- IF-<k> <date> checkpoint-<N> @<sha>: <check> failed: `<command>` -> <first error lines or file:line>. Action: <what to do>.``, and later closes it with `- IF-<k> resolved by <sha>`. This is a shared-file exception: WS0 only appends to the closing `## Integration feedback` section, and the check treats it like the CHANGELOG rule;
- summarises the minimum available memory and the peak commit charge from `tools/memsampler.ps1`'s log (the memory gate), restarting the sampler if its log is stale. It also warns when `OneDrive.exe` runs and the repo path is under `%OneDrive%`;
- lists open `ADR-pending` markers (`tools/adr-pending.ts`, section 7.4);
- writes `docs/status/checkpoint-N.md`, including the "Cloud streams" table (section 7.3);
- runs `git push origin main --follow-tags` after every run and every tag. The event tags are annotated and on `main`, and `pre-push` guards `vendor/`.

The user decides ADRs and open questions and approves checkpoint reports. The user also does the physical and visual tasks: install consent, judging an ambiguous screenshot, the flashcart and the M5 tester. The user also launches the cloud sessions and relays WS0's merge messages to them. That comes to about 1-2 hours a day. All instances share one permission allowlist in `.claude/settings.json`, which WS0 owns; cloud sessions read it from their clone.

### 7.3 Integration checkpoints

A checkpoint is a two-hour review on top of WS0's daily integration. WS0 runs it and the user approves the report. WS8 takes part from the day it starts.

| Checkpoint | Hybrid (chosen) and upgraded fallback | Standard fallback |
|---|---|---|
| CP-A | D+3 | D+3 |
| CP-B (M0) | D+7 | At M0, ~D+7-10, when slot 1 passes to WS3 |
| CP-C (M1) | D+14 | At M1, ~week 4-5 |
| Then | Weekly from week 3 | Weekly, plus one at every slot hand-off |

**Late-start freeze rule.** A stream that starts after the checkpoint at which one of its interfaces would freeze (for example WS6's panel API at CP-A in the standard fallback, or a cloud owner staggered by usage limits) freezes its own published interfaces at the first checkpoint that falls at least three working days after its start.

- **CP-A:**
  - contract friction review and ADRs for T2 changes;
  - **freeze** C11 `dsd_platform.h` (WS2), the C12 panel API + `fixtures/ide/mock-host` (WS6; hybrid and upgraded mode), and C4 `BuildService` (already typed in Phase 0; WS1 confirms it);
  - contract-file ownership already moved at the tag (`tools/ownership.json`), so CP-A only checks that the table matches reality;
  - hybrid: WS5 and WS7 start as cloud sessions. Upgraded fallback: WS5 starts.
- **CP-B (M0):**
  - M0 accepted (section 8);
  - **freeze** C7's `LanguageServiceHost` (WS4) and C12's preview API (WS5; in the standard fallback, per the late-start freeze rule above);
  - WS2's host VM runs `hello.dsdb`, and conformance v0 and v1 have execution goldens;
  - WS4's goldens match;
  - `compileProject()`, `packAssets()` and `checkRoomBudgets()` are wired into `BuildService` as they land, using the `CompileFn`/`PackAssetsFn` types of section 5 C4;
  - `fixtures/runtime/` refreshed;
  - hybrid and upgraded mode: WS3's selftest ROM passes its screenshot checks for sprites and BGs and logs touch and sound. WS5 packs the flappy assets; in hybrid mode, WS0's local integration checks them with the real grit/mmutil;
  - hybrid: WS6b starts as a cloud session if usage limits allow. Upgraded fallback: WS7 starts, headless first.
- **CP-C (M1):**
  - first bytecode on the DS;
  - the microbenchmark hard gate (section 8, M1). Below the gate, WS2 first adds the int-specialised opcodes reserved in C2, and WS4 emits them when the checker proves both operands are int. This comes before any engine feature;
  - from here, conformance tiers are mandatory in the integration run, and in CI once WS8 has set it up;
  - hybrid and upgraded mode: slot 1 passes from WS1 to WS8 (`start-ws8`).
- **Weekly after CP-C:**
  - `npm run check`, all package tests and the host goldens;
  - `dsdude play samples/flappy` on melonDS and DeSmuME, checked with log assertions plus `dsdude screenshot`;
  - contract changes since the last checkpoint, with the ABI hash bumped if needed;
  - the memory log, the `ADR-pending` inventory, the "Cloud streams" table, and the usage-limits question to the user.

  Milestone checkpoints M2..M6 follow section 8.

**Cloud branches at integration and checkpoints.**
- **Fetch.** Every integration run starts with `git fetch --prune --tags origin '+refs/heads/ws*:refs/remotes/origin/ws*' '+refs/heads/claude/*:refs/remotes/origin/claude/*'`.
- **Refs to integrate.**
  - Local streams: `wsN-<name>`.
  - Cloud streams: `origin/<push target>` from `docs/status/cloud.md`.
  - A new target is the fetched ref whose `docs/status/wsN.md` names it in its `Cloud push target:` line. WS0 cross-checks it with the branch the user passed on, then updates the registry.
  - `tools/adr-pending.ts` greps these refs too.
- **Merge.** Merges happen on a throwaway branch, so `main` moves only when green and is never force-moved: `git switch -C integrate main`, then for each ref `git merge --no-ff <ref> -m "Merge wsN-<name> (cloud <target>@<sha>)"` (local refs: `-m "Merge wsN-<name>"`).
  - On a conflict: `git merge --abort`, refuse the ref, and record an `IF-` entry (appended with the report) asking the stream to merge `main` (cloud: `origin/main`) and resolve it.
  - After each merge, `npm run check && npm test` (after `npm install` if a `package.json` changed). On red, `git reset --hard HEAD~1` (on `integrate` only) and refuse that ref.
  - Finally `git switch main; git merge --ff-only integrate; git branch -D integrate`, before the report and the push. Local streams read the same `main` ref, so they never see a refused merge.
  - If the target is not `wsN-<name>`, WS0 also fast-forwards the stream line with `git push origin <merged tip>:refs/heads/wsN-<name>` (never `--force`), so replacement sessions start there.
- **Ownership.** The per-commit check runs on `main..<ref>`, with the stream from each commit's trailer, or the registry's stream when the trailer is missing.
- **Report.** `docs/status/checkpoint-N.md` adds a "Cloud streams" table with these columns: target@sha, commits behind main, merged or refused, the local-only results, and the versions `start.sh` recorded.
- **Cloud checkpoint ritual.**
  - The stream commits, updates `docs/status/wsN.md` (including `start.sh`'s version line) and pushes with `push.sh`.
  - It then waits until the user relays "WS0 merged checkpoint-N". WS0 says this after pushing `main`.
  - The user sends the message in the web UI or with `claude -p "<message>" --cloud <session-id>`. The relay text is: "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then `git restore package-lock.json; git fetch origin && git merge origin/main; npm install; git restore package-lock.json`. Read docs/status/checkpoint-N.md and your open IF- entries, fix those first, then continue from docs/status/wsN.md." The session's VM may have been reclaimed while it waited, so the relay restarts it from scratch; `start.sh` also prints the latest checkpoint report and the number of open `IF-` entries.

### 7.4 Contract-change protocol

Changes are tiered by their effect on consumers. "Owner" means the file's owner in `tools/ownership.json`.

| Tier | What | How |
|---|---|---|
| **T0** | Doc/example text, comments | The owner commits directly with a `contracts/CHANGELOG.md` line. |
| **T1** | Additive: an appended builtin, a new opcode, an optional IPC field, a new limit key | The owner commits with a minor version bump, regenerated outputs and a CHANGELOG entry. WS0 reviews within 24 hours at the daily integration. |
| **T2** | Breaking | ADR, co-signed by every affected owner, merged by WS0. |

1. A T2 change starts as `docs/adr/NNNN-short-title.md` (context, decision, alternatives, affected streams, migration). WS0 drafts the recommended answer; the user decides.
2. Every T1 or T2 change does four things **in the same commit**: bumps the contract's version (`minor` = additive, `major` = breaking), adds a `contracts/CHANGELOG.md` entry, regenerates generated files and updates fixtures. "PR" in this plan means "branch merged by WS0"; no stream opens GitHub pull requests.
3. In weeks 1-4, WS0 merges C2/C6/C11 changes within 24 hours instead of waiting for a checkpoint.
   - `ws2-*` and `ws4-*` may merge each other's branches between checkpoints; the per-commit ownership check (section 3.4) allows this.
   - Both are cloud streams in hybrid mode, so WS0 fetches their changes from the push targets registered in `docs/status/cloud.md`.
   - A WS2/WS4 cross-merge takes the other stream's push target: `git fetch origin '+refs/heads/<target>:refs/remotes/origin/<target>'`, then `git merge origin/<target>`.
4. `builtins.json` ordinals are append-only. Any edit to the ids, names, kinds or signatures of function, variable or constant entries changes the ABI hash (doc/example edits and alias/unsupported entries do not), and the loader refuses mismatched bytecode with a readable message, so nothing silently misbehaves. `tools/gen-dsdb.ts` regenerates the committed `.dsdb` fixtures in the same commit.
5. Streams never work around a contract silently. They file the ADR as a new `docs/adr/NNNN-<title>.md` (any stream may create one; section 3.4) with a proposed answer, mark the local assumption `// ADR-pending ADR-NNNN`, and continue. `tools/adr-pending.ts` greps all local `ws*` branches and the fetched cloud refs (`origin/ws*`, `origin/claude/*`) for `ADR-pending` and lists the results in each checkpoint report. Blockers are ADR drafts, not chat.
6. Toolchain changes (anything that would run `pacman`/`wf-pacman`) are WS1's ADRs (WS8's after the hand-off; WS0's while neither is running in the standard fallback), applied at a checkpoint when no builds are running. Changes to the cloud environments' setup script (Node, make, Playwright) are WS0's ADRs; a cloud session never installs system packages.

### 7.5 Kickoff prompts and kickoff files

**Kickoff files.** WS0 completes `docs/kickoff/wsN.md` for each stream in Phase 0, starting from the drafts written during planning, which the Day-0 commit already contains. Every kickoff has a mode line ("Operating mode: hybrid (local)" or "Operating mode: hybrid (cloud session)") and gives its start in each mode. Each file contains:
- for a local stream (WS1, WS3, WS6, WS8):
  - the exact worktree commands: `git worktree add ..\DSDude-wsN -b wsN-<name>` and `git config --worktree dsdude.ws WSn`;
  - the env block: `DSDUDE_HOME`, the port base, `DSDUDE_MAKE_JOBS` (4 in hybrid and standard mode), and the Wonderful env with `CHERE_INVOKING=1`;
  - machine facts: MSYS2 paths, `C:\msys64\ucrt64\bin` on PATH for host gcc, Node 24 running `.ts` natively, and the local limits of section 7.2;
- for a cloud stream (WS2, WS4, WS5, WS7, WS6b), a "Cloud setup" block in place of the worktree commands, env block and machine facts. It gives:
  - the stream's environment `dsdude-wsN`, its stream line `wsN-<name>` and its port base;
  - its Linux test command and its row of the cloud table below;
  - a pointer to `docs/kickoff/README.md` section 8.

  Its paste block starts with the cloud preamble below;
- the contract files with paths and versions, and the stream's owned paths from `tools/ownership.json`;
- the stream's definition of done and isolation strategy, copied verbatim from section 6;
- "How you verify without eyes": `DSD|` lines and `dsdude screenshot` PNGs, read with the image-capable Read tool. Cloud streams use host traces and test output, plus WS0's `IF-` entries for what only a local run shows;
- its `docs/status/wsN.md` progress file, which ends with the `## Integration feedback` section that only WS0 appends to;
- "Put a timeout on every spawned process";
- the checkpoint ritual: commit, update status, then stop touching the branch until WS0 reports the merge. A cloud stream also pushes with `push.sh` and waits for the user's relay (section 7.3);
- "Merge main daily (`origin/main` in the cloud); never rebase once WS0 has merged any of your commits";
- any leftovers the stream inherits from the previous stream in its slot (standard fallback), or from WS1 (for WS8).

The root `CLAUDE.md` carries one rule for them: "**Cloud sessions** (`CLAUDE_CODE_REMOTE=true`, Linux): follow `docs/kickoff/README.md` section 8 and your kickoff's "Cloud setup" block. The PowerShell env block, the Windows machine facts and the Windows shell rules do not apply; the Code rules do." The "Code rules" section of `CLAUDE.md` (erasable TypeScript syntax, explicit `.ts` imports, `tsc -b`, LF, binary golden writers) binds every instance, local and cloud.

**Branches, worktrees and env per stream.** `DSDUDE_PORT_BASE` gives each stream ten ports: the electron-vite dev server uses the base, and Vitest browser mode and Playwright use base+1 to base+9.

| Stream | Branch | Hybrid | Worktree | `DSDUDE_HOME` | `DSDUDE_PORT_BASE` |
|---|---|---|---|---|---|
| WS0 | `main` | local | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude` | 5100 |
| WS1 | `ws1-toolchain` | local, slot 1 | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude` | 5110 |
| WS2 | `ws2-runtime-core` | cloud, `dsdude-ws2` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws2` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws2\.dsdude` | 5120 |
| WS3 | `ws3-platform` | local, slot 2 | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3\.dsdude` | 5130 |
| WS4 | `ws4-compiler` | cloud, `dsdude-ws4` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws4` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws4\.dsdude` | 5140 |
| WS5 | `ws5-assets` | cloud, `dsdude-ws5` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws5` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws5\.dsdude` | 5150 |
| WS6 | `ws6-ide` | local, slot 3 | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6\.dsdude` | 5160 |
| WS6b | `ws6b-editors` | cloud, `dsdude-ws6b` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6b` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws6b\.dsdude` | 5170 |
| WS7 | `ws7-learn` | cloud, `dsdude-ws7` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws7` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws7\.dsdude` | 5180 |
| WS8 | `ws8-release` | local, slot 1 from CP-C | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8` | `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8\.dsdude` | 5190 |

A cloud stream works in its session's clone of `origin`, with `DSDUDE_HOME=$HOME/.dsdude`. Its worktree and Windows `DSDUDE_HOME` apply only after a fallback (section 7.2). WS8 gets its own branch and worktree in every mode. In hybrid and upgraded mode, the WS1 instance commits its last WS1 work at CP-C, WS0 merges it, and the instance continues in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8`.

Env block for local streams (PowerShell, set before starting `claude` in the worktree; `<n>` from the table):

```powershell
$env:DSDUDE_HOME = 'C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws<n>\.dsdude'   # WS0: C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude
$env:DSDUDE_PORT_BASE = '<port base from the table>'
$env:DSDUDE_MAKE_JOBS = '4'   # hybrid and standard mode always; upgraded mode while more than two stream instances run
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = "C:\msys64\opt\wonderful\bin;$env:PATH;C:\msys64\ucrt64\bin"   # ucrt64\bin last: host gcc and mingw32-make need it (section 2.4)
```

**Cloud sessions (short form).** The canonical text, with the setup script and the reference `tools/cloud/*.sh`, is `docs/kickoff/README.md` section 8.

- **One-time setup (user, Day 0-1).** Sign in at claude.ai/code and authorize GitHub. Then create five environments (cloud icon > Add cloud environment): `dsdude-ws2`, `-ws4`, `-ws5`, `-ws7`, `-ws6b`.
  - **Network: Custom.** Keep the default package-manager list and add `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`. Trusted lacks the Playwright hosts; the fallback is Full.
  - **Variables.** No secrets, because every user of the environment can read them. For `dsdude-ws4`: `DSDUDE_WS=WS4`, `DSDUDE_PORT_BASE=5140`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`. The WS/port pairs are WS2/5120, WS4/5140, WS5/5150, WS7/5180 and WS6b/5170.
  - **Setup script,** the same in all five. It installs Node `v24.16.0` (npm 11, as on this machine) into `/opt/node24` from nodejs.org, installs `gcc` and `make` if missing, and runs `npx -y playwright@1.63.0 install --with-deps chromium`. It runs as root once per cache, must exit 0 within about 5 minutes, and re-runs after edits, host changes or about 7 days.
- **Launching WSn (user).**
  1. WS0 says "launch WSn (cloud)" once it has tagged `start-wsN` and pushed `main`, the tags and `wsN-<name>`.
  2. At claude.ai/code (or the mobile Code tab), choose:
     - repository `<user>/dsdude`;
     - branch `wsN-<name>`, or `main` if the selector does not offer it (`start.sh` adopts the stream line);
     - environment `dsdude-wsN`;
     - mode **Auto** if offered, else Accept edits.

     A pre-filled link also works: `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-wsN`.
  3. Paste the "Paste this to start" block from `docs/kickoff/wsN.md` (the cloud preamble below plus the stream's second paragraph), and rename the session `WSn <name>`, where `<name>` is the branch suffix (e.g. `WS4 compiler`).
  4. Give WS0 the session URL and the branch the session reports.
- **First commands.**

  ```bash
  git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn
  bash tools/cloud/start.sh     # 10-minute tool timeout
  ```

  - **The SessionStart hook** is `tools/cloud/session-start.mjs`: plain JS that never fails and exits at once unless `CLAUDE_CODE_REMOTE=true`. It appends `export PATH=/opt/node24/bin:$PATH` and `export DSDUDE_HOME=$HOME/.dsdude` to `$CLAUDE_ENV_FILE`, and runs the three git config commands when `DSDUDE_WS` is set.
  - **`start.sh`** runs these steps in order:
    1. It checks for Node 24 and npm 11.
    2. It unshallows the clone and fetches the tags, `main`, the stream line and the target registered in `docs/status/cloud.md`, and adds `main` to the clone's fetch refspec, so a plain `git fetch origin` always updates `origin/main` and its tags (a single-branch clone would otherwise fetch only its own branch).
    3. It adopts the stream line without ever discarding stream work, and stops when HEAD and the line have diverged.
    4. It runs the lockfile guard and `npm install`, and restores the lockfile if npm rewrote it.
    5. It smoke-tests the Linux native binaries: biome, tsc, esbuild, rollup, lightningcss and `@tailwindcss/oxide`.
    6. It checks gcc and make (WS2, WS4), or runs `npx playwright install chromium` (WS7, WS6b).
    7. It prints the versions, the push target, how far the branch is behind `origin/main`, the latest `docs/status/checkpoint-N.md` and the number of open `IF-` entries.
- **Linux env block.** The hook and the environment provide these; there is no MSYS2/Wonderful block.

  ```bash
  export PATH=/opt/node24/bin:$PATH
  export DSDUDE_HOME=$HOME/.dsdude
  export DSDUDE_SKIP_ELECTRON=1 DSDUDE_MAKE_JOBS=4
  export DSDUDE_PORT_BASE=5180   # the stream's base; only the WS7 (5180) and WS6b (5170) browser tests use it
  ```

- **Pushing.**
  - **Constraint.** The official docs say a session can push only to its current working branch. Interactive sessions auto-create `claude/<adjective>-<surname>-<hash>` branches, and users report HTTP 403 for any other name.
  - **`push.sh`.** The canonical stream line stays `wsN-<name>`, created by WS0 at launch. `bash tools/cloud/push.sh` first restores the lockfile and runs the guard, and refuses commits that change `package-lock.json` or lack the `DSDude-WS:` trailer. It then tries these targets in order: the recorded target, `wsN-<name>`, `claude/wsN-<name>`, the session's own branch.
  - **New targets.** A new target is recorded as a `Cloud push target:` line under the title of `docs/status/wsN.md`, so each stream has one target at a time. WS0 copies it into the registry `docs/status/cloud.md`, one line per stream: ``- WS4: environment `dsdude-ws4`; session <url>; push target `<ref>`; started <date>; last merged <sha>``.
  - The probe (section 7.1) settles which targets work. Stop-hook pushes to other branches are ignored.
- **Daily work.**
  - Make small commits and run the stream's Linux test (table below) before each one.
  - Push every green batch, and never end a turn with unpushed work, because idle VMs are reclaimed. If the Stop-hook reminder arrives while tests are red, fix or revert first.
  - The daily merge is `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`.
  - After each fetch, read `docs/status/checkpoint-N.md` and your own `## Integration feedback` section on `origin/main` (`git show origin/main:<path>`). Fix open `IF-` entries first. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading and push; WS0 re-runs the check and appends the resolved line.
  - At a checkpoint, wait for the user's relay (section 7.3) and do what it says.
- **Resume.**
  - Reopen the same session and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/wsN.md." A reclaimed VM keeps the conversation but loses processes and unpushed files.
  - Replace a session only when it is archived or unusable. The new one uses the same environment, the kickoff's paste block and "continue from docs/status/wsN.md", and its URL goes to WS0.
  - `/compact` works; `/clear` does not.
- **Lockfile.** The rules are in section 3.4. In the cloud, `npm install` is used, never `npm ci`, and the lockfile is restored after every install. A new dependency is `npm install <pkg>@<exact> -w <own package>`, committing only that `package.json`. If the guard fails, the stream:
  - leaves the lockfile alone;
  - writes `BLOCKER lockfile` in its status file, pushes it, and tells the user;
  - meanwhile installs the missing binary with `npm install --no-save <missing>@<version>` (e.g. `@tailwindcss/oxide-linux-x64-gnu@4.3.3`), never `--force`.
- **A cloud session never:**
  - edits `vendor/` or root config;
  - stages or deletes `package-lock.json`, or runs `npm ci`;
  - runs Windows tools, emulators, py-desmume or Electron;
  - installs system packages;
  - pushes except via `push.sh`, pushes `main` or tags, or force-pushes;
  - opens PRs;
  - stores secrets in variables;
  - leaves background processes running.

**Cloud streams: Linux tests and local checks.** Linux green alone is never done: WS0 runs the right-hand column at every integration.

| Stream | Linux test before commit | Cloud verifies | Verified locally on Windows |
|---|---|---|---|
| WS2 | `make -f runtime/Makefile.host test` | Ubuntu gcc build of `runtime/build-host/dsdude-host`; conformance tiers, deterministic `--seed` traces, UBSan trap; goldens in `fixtures/conformance/expected/**` | WS0: `mingw32-make -f runtime/Makefile.host test` (gcc 15.2) on the same goldens, which is the DoD's cross-compiler identity check; builds `fixtures/runtime-core/flappy-nitrofs/` with local grit/mmutil (a WS0 row for that folder). WS3: the DS compile of the core, spikes 12 and 14, the M1 benchmark |
| WS4 | `npm test -w packages/compiler -w packages/lang -w packages/dsdb`, then `npx tsc -b packages/compiler packages/lang packages/dsdb` | goldens, `npx dsdude compile --json`, `node tools/gen-dsdb.ts`, conformance 6-10 on the Linux host | WS0: the same tests; `hello.dsdb` on both emulators and the M1 gate (with WS3) |
| WS5 | `npm test -w packages/asset-pipeline` | decode, quantizer, stitch, manifest, preview, budgets, E4xx, cache; tool tests print `skipped: no ToolPaths` | WS0: the same tests with real grit/mmutil, `npx dsdude assets samples/flappy`, GRF/soundbank identity, XM fixture, the py-desmume golden in `fixtures/assets/golden/` (a WS0 row). WS3: both sides of spike 11 |
| WS7 | `npm test -w packages/language-service -w packages/monaco-dss -w tools/gen-docs`, then `npx tsc -b packages/language-service packages/monaco-dss tools/gen-docs` | gen-docs, manual, templates, Monarch and completion in headless Chromium (ports 5181-5189) | WS6: the glue in the Electron IDE at checkpoints. WS0/WS8: the M4 template screenshots and the M5 tutorial |
| WS6b | `npm test -w packages/editor-core` (plus `-w apps/ide` for view changes) | editor cores; mock-host views in browser tests (ports 5171-5179); 60 fps checks report only (software WebGL) | WS6: editors in the shell and the 60 fps checks |

The per-package `CLAUDE.md` is the primary brief. It cites `PLAN.md` sections by number, so no stream has to read the whole plan.

**Shared preamble** (paste first for every local stream: WS1, WS3, WS6, WS8):

> You are workstream **WSn: <name>** on DSDude, a GameMaker-like Nintendo DS IDE. Read `docs/kickoff/wsN.md` first, then your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md` and the contract files listed for you; read the `PLAN.md` sections they cite, not the whole file. Work only inside the paths `tools/ownership.json` assigns to you; WS0's integration refuses anything else. Edit only the contract files `tools/ownership.json` assigns to you (T0/T1 directly, T2 via ADR; section 7.4); never edit root config files or `package-lock.json`; never run `pacman`/`wf-pacman`; put a timeout on every process you spawn. If a contract blocks you, write `docs/adr/NNNN-<title>.md` with a proposed change, mark your workaround `// ADR-pending ADR-NNNN`, and continue. Branch `wsN-<name>` in worktree `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-wsN`; merge `main` into your branch daily (never rebase once WS0 has merged any of your commits); small commits; run `npm test -w <your package>` (or `mingw32-make -f runtime/Makefile.host test` / `make -j4` for the runtime) before each commit. Keep to the capacity rules of section 7.2: `vitest run --pool=threads --maxWorkers=2`, no watch mode, close the dev IDE and the emulator after each test. You cannot see emulator windows: verify with `DSD|` lines and `dsdude screenshot` PNGs. Keep `docs/status/wsN.md` current. Test in isolation using the fixtures and mocks named below; do not wait for other streams. Report blockers as ADR drafts.

**Cloud preamble** (paste first for every cloud stream: WS2, WS4, WS5, WS7, WS6b). It replaces the first paragraph of the kickoff's paste block. The second paragraph keeps its reading list and first task, with "Operating mode: hybrid (cloud session)".

> You are workstream **WSn: <name>** on DSDude, a GameMaker-like Nintendo DS IDE, running as a Claude Code **cloud session** (Ubuntu VM, no Windows tools).
>
> - **Start:** run `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn`, then `bash tools/cloud/start.sh` (10-minute timeout). Report failures rather than working around them.
> - **Read:** `docs/kickoff/wsN.md` (its "Cloud setup" block replaces the Windows setup, env block and machine facts), `docs/kickoff/README.md` section 8, your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md`, your contract files, and only the `PLAN.md` sections they cite.
> - **Paths and pushing:** write only the paths `tools/ownership.json` gives WSn. Your stream line is `wsN-<name>`; push only with `bash tools/cloud/push.sh`, after every green batch.
> - **Never:** commit `package-lock.json`, run `npm ci`, edit root config or `vendor/`, or run Windows tools, emulators or Electron.
> - **Tests and merges:** run `<Linux test command>` before each commit, with a timeout on every process. Merge `origin/main` daily, and never rebase once WS0 has merged your commits.
> - **Blockers:** if a contract blocks you, write `docs/adr/NNNN-<title>.md`, mark the workaround `// ADR-pending ADR-NNNN`, and continue.
> - **Status:** fix open `## Integration feedback` entries in `docs/status/wsN.md` first, and never edit that section. The VM is ephemeral, so your branch and `docs/status/wsN.md` are your only memory: keep the file current and continue from it.

**Per-stream lines.** Owned paths are the stream's rows in the section 3.4 table (`tools/ownership.json`) and are not repeated here. "Starts" gives the hybrid start first, then the fallbacks.

- **WS1**
  - Starts: at hour zero, locally in slot 1. At CP-C the slot continues as WS8 (hybrid and upgraded mode). In the standard fallback, WS1 hands slot 1 to WS3 at M0.
  - Contracts: C4, C5, C8, C9, C10, C14.
  - First, for `toolchain-ok`: the section 7.1 install, with the user present; `dsdude toolchain status --json`; `samples/hello` (Makefile + `main.c` with the one-protocol log path of section 5 C8), `fixtures/runtime/hello/` and `fixtures/build/`; the `packRom()`/`verifyRom()` header check; `dsdude build samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets && dsdude play samples/hello --no-build` in melonDS and DeSmuME, launched without `windowsHide` with a generated `melonDS.toml` under `DSDUDE_HOME`, capturing `DSD|LOG|hello`; `dsdude screenshot` (spike 7).
  - Then: EmulatorManager hardening, the C10 flags, and `BuildService` behind the Phase-0 types in `packages/toolchain/src/api.ts` (confirmed at CP-A), `createFakeToolchain()`, cancellation, graceful Stop, the basic DeSmuME profile, and registration of each package's `cliCommands`.
  - `dsdude doctor` and the tools pack if time remains before the hand-off; otherwise they go to WS8, with wiring `compileProject`/`packAssets` for whichever has not landed.
- **WS2**
  - Starts: at the tag, as a cloud session (`dsdude-ws2`). In the standard fallback, it starts locally in slot 2.
  - Contracts: C2, C3, C6, C8, C9, C11, C13, C14.
  - First: `value.h` and fixed math with tests; the DSDB loader with header/ABI checks; the computed-goto VM running `fixtures/bytecode/hello.dsdb` on the host with the JSONL trace.
  - Then, by D+7: strings and `show_debug_message`, so conformance v0 and v1 have execution goldens. Also publish `dsd_platform.h` by CP-A; `fixtures/bytecode/bench.dsda` with the M1 op mix; `runtime/Makefile.host` building with both UCRT64 and Linux gcc.
  - `runtime/Makefile.host` rules:
    - identical flags on both compilers: `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char`;
    - `ifeq ($(OS),Windows_NT)` only for `EXE := .exe`, with recipes that run in both cmd.exe and `/bin/sh`;
    - no `-Werror` (GCC 13 and 15 warn differently);
    - fixed-width integers only (`long` is 32-bit on Windows, 64-bit on Linux);
    - `-fsanitize=undefined -fsanitize-trap=undefined` on both;
    - no reliance on more than 1 MB of stack.

    The Linux build is tested in the cloud, and WS0 runs the MinGW build on the same goldens at every integration.
  - Then: instances/events in C6 order, motion, collision grid, alarms, animation, draw lists, and builtins from `runtime/gen/builtins_table.h`.
- **WS3**
  - Starts: at `toolchain-ok`, locally in slot 2, not before the tag (hybrid and upgraded mode). In the standard fallback, it starts at M0 in slot 1.
  - Contracts: C3, C8, C11, C13.
  - First: `runtime/Makefile` and `runtime/package.json` as in section 6 WS3, and `npm run build:runtime`.
  - The selftest ROM, checked with `dsdude screenshot`: 128 sprites per screen with extended palettes, two GRF text BGs, the UI text layer, touch, maxmod, NitroFS, the one-protocol log path, the error console, a timed 1 MB NitroFS read, the C-stack high-water mark, and the scanline page.
  - Then: implement `dsd_platform.h` and compile the core with the DS Makefile; the DS timer harness for the M1 benchmark; the `.itcm`/`.dtcm` report.
  - For the cloud streams, WS3 runs locally both sides of spike 11 and spikes 12 and 14 against WS2's host harness.
  - In the standard fallback, do the M1 path (platform init, NitroFS, log, timer harness) before the rest of the selftest ROM.
- **WS4**
  - Starts: at the tag, as a cloud session (`dsdude-ws4`); in the standard fallback, locally in slot 3. Owns `packages/dsdb` and `contracts/opcodes.json` from then on, with WS2 co-signing changes.
  - Contracts: C1, C2, C3, C6, C7, C9, C13, C14.
  - First: lexer + parser with error recovery and optional semicolons (section 4); binder with slot layouts; codegen to `.dsda`, with golden tests against `samples/flappy`.
  - Then: `compileProject()` matching `CompileFn`, and `dsdude compile --json` exported through `cliCommands`; the C7 `LanguageServiceHost` in `packages/lang/src/host.ts` by CP-B; conformance programs 6-10.
  - Then: the checker (20 beginner mistakes, each with a test), the formatter, peephole passes, and int-specialised opcodes if the M1 gate needs them.
- **WS5**
  - Starts: at CP-A (D+3), as a cloud session (`dsdude-ws5`), or later if usage limits stagger it. In the upgraded fallback it starts locally at CP-A; in the standard fallback, after WS4 in slot 3.
  - Contracts: C1, C3, C4, C9, C12, C13, C14.
  - First: `contracts/assetpack.md` on day 1 (section 2.9, section 5 C3); PNG decode → RGB555 quantizer → strip/stitch, with golden byte tests.
  - Then: `ToolPaths` wrappers for grit and mmutil, using the section 2.9 command lines, with skip-if-missing tests; the XM fixture. In the cloud these tests print `skipped: no ToolPaths`. WS0's local integration runs them with the real tools and reports failures as `IF-` entries.
  - Then: `packAssets()` matching `PackAssetsFn`, and `dsdude assets samples/flappy --json` through `cliCommands`, writing `<build>/nitrofs` and `<build>/assets.manifest.json` in the project's build directory (section 3.2).
  - The preview API: types exist from Phase 0; it freezes at CP-B in hybrid and upgraded mode, or per the late-start freeze rule of section 7.3 in the standard fallback.
  - Then: cache, `checkRoomBudgets` (C4) and the E4xx catalog.
- **WS6**
  - Starts: at the tag, locally in slot 3 (hybrid and upgraded mode). In the standard fallback, it starts after WS5 in slot 3, with the visual editors.
  - Contracts: C1, C4, C5, C8, C9, C12, C13.
  - First: the electron-vite 5 skeleton with CJS main/preload, `sandbox: true` set explicitly, the section 2.5 CSP, and zod IPC over `packages/ipc-contract` (owned from the tag). `userData` and the dev-server port come from `DSDUDE_HOME` and the worktree's port base.
  - Then: open `samples/flappy` into the store; dockview-react with the project tree, Monaco host (plain text until WS7's `packages/monaco-dss` lands), Output and Problems; Play/Stop against the Phase-0 `MockBuildService`.
  - The panel API and `fixtures/ide/mock-host` by CP-A (hybrid and upgraded mode) or per the late-start freeze rule of section 7.3 (standard fallback). The real `BuildService` for M0 at CP-B (hybrid and upgraded mode), or on day 1 (standard fallback).
  - Keeps the `apps/ide` browser-test project runnable with `DSDUDE_SKIP_ELECTRON=1`, and checks WS7's and WS6b's UI in the Electron IDE at checkpoints.
  - Then: object editor, import dialogs, Learn panel host, Controls card, meters, wizard and the Playwright smoke test; the visual editors too, unless WS6b runs.
- **WS6b (optional)**
  - Starts: at CP-B (D+7), as a cloud session (`dsdude-ws6b`), and only if usage limits allow. It is the first stream dropped when they bite; WS6 then builds the editors. In the fallback modes it starts only in a freed slot, and only if the memory gate allows.
  - Contracts: C1, C6, C12, C13.
  - First: the sprite editor core as pure functions with Vitest, then the Canvas 2D view in the mock host.
  - Then: room editor in PixiJS 8 with both screens; background and sound editors; live meters. In the cloud the 60 fps checks only report; WS6 runs them and checks the editors in the shell.
- **WS7**
  - Starts: at CP-A (D+3), as a cloud session (`dsdude-ws7`), headless first. In the upgraded fallback it starts at CP-B, headless first; in the standard fallback, when WS2 hands over slot 2.
  - Contracts: C1, C2, C6, C7, C9, C12, C13.
  - First: the manual skeleton with "Differences from GameMaker"; `tools/gen-docs` from `builtins.json`, plus the `TODO(WS7)` builtin docs and examples; templates validated by `project-format` tests.
  - Then: the Monarch tokenizer and builtins-only completion in `packages/monaco-dss`, tested with `@vitest/browser-playwright`; after that, the full service over C7's `LanguageServiceHost`.
  - Then: Learn panel content, and the Flappy tutorial, which is exercised at M5.
  - Takes over `samples/minimal` and `samples/flappy` at M2.
- **WS8**
  - Starts: at CP-C, locally in slot 1, as the continuation of WS1 (hybrid and upgraded mode). In the standard fallback, it starts in slot 1 after WS3.
  - Contracts: C4, C5, C8, C10.
  - First: the leftovers listed in `docs/kickoff/ws8.md`: wiring `compileProject`/`packAssets` into `BuildService` if either is not wired yet, `dsdude doctor`, the tools pack with its import walk and clean-PATH test, DeSmuME-profile polish, and in the standard fallback WS3's M4 stress check and hardware notes.
  - Then: `npm run e2e` with py-desmume screenshots and melonDS log assertions on `samples/hello|minimal`; `scripts/ci.ps1`, plus `.github/**` workflows. The Actions cost on the private repo is a WS8 ADR.
  - Then: electron-builder NSIS bundling the tools pack and melonDS 1.1, with an installer build ready before M5; the license bundle and source archives; the clean-VM test; the hardware checklist.

## 8. Milestones

Days count from Day 0 (section 7.1). Weeks count from the `phase0` tag: week 1 starts on tag day D, and D+7 opens week 2. Dates depend on the operating mode (section 7.2). Hybrid is the plan; standard and upgraded mode are fallbacks.

| Milestone | Hybrid (plan) | Standard (fallback) | Upgraded (fallback) | Needs |
|---|---|---|---|---|
| phase0 | day 2 | day 2 | day 2 | WS0 |
| toolchain-ok | day 1-3 | day 1-3 | day 1-3 | WS1 |
| M0 Hello from Play | week 2 (D+7) | week 2 (~D+7-10) | week 2 (D+7) | WS1's `packRom()`, `EmulatorManager` and log capture; WS6's Play button and WS3's selftest ROM in hybrid and upgraded mode |
| M1 First bytecode on the DS | week 3 (D+14) | week 4-5 | week 3 (D+14) | WS2's VM (cloud), WS3's platform layer, and WS4's codegen (cloud) or hand-assembled bytecode |
| M2 Sprite moves from a script via CLI | week 4-5 | week 7-8 | week 4-5 | WS5, WS2's engine, WS3, WS4 |
| M3 IDE Play end to end | week 6-7 | week 11-12 | week 6 | WS6, WS7's language service |
| M4 Feature-complete 0.1 | week 8-9 | week 14-16 | week 8 | all streams |
| M5 A beginner builds Flappy Bird | week 10-11 | week 15-17 | week 9-10 | M4, WS8's installer build, the tester (question 5) |
| M6 Release 0.1 | week 12-14 | week 16-20 | week 12 | WS8 |

Hybrid keeps upgraded mode's milestone criteria, checkpoints (CP-A D+3, CP-B D+7, CP-C D+14, then weekly; section 7.3), freezes and ownership events. Its later dates trail upgraded mode by up to a week (two at release) because of integration round-trips. A failure that only a local run finds (real grit/mmutil, MSYS2 gcc, the DS build of the core, emulators, Electron) goes back to the cloud stream as an `IF-` entry in its `docs/status/wsN.md`, and the stream fixes it before new work (section 7.2). A milestone is accepted only after WS0's local run on Windows; a green cloud run alone never passes one.

WS0 re-checks the calendar at CP-A and at each milestone checkpoint. If the switch to standard mode is recorded (section 7.2), WS0 re-plans at the next checkpoint and the standard column applies from there. After a RAM upgrade, the upgraded column applies.

**phase0 (day 2)**
- The minimum-viable contracts (section 7.1) are committed with versions.
- `npm install && npm run check && npm test` is green in a clean clone (`git clone C:\Users\zache\OneDrive\Desktop\Projects\DSDude C:\Users\zache\OneDrive\Desktop\Projects\DSDude-clean`, removed afterwards).
- Both git hooks are proven to run (a merge of main with a regenerated lockfile passes), and Makefiles and hooks check out with LF.
- `docs/kickoff/wsN.md` exists for every stream.
- Cloud readiness:
  - `main` is on the private `origin` with the cloud pieces of section 7.5: the `.claude/settings.json` SessionStart hook, `tools/cloud/**`, `tools/check-lockfile.mjs`, `tools/postinstall.mjs` and `docs/status/cloud.md`;
  - `git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md'` prints nothing: `vendor/README.md` is the only vendor file anywhere in GitHub's history;
  - either the Day-1 cloud probe ran `bash tools/cloud/start.sh`, then `npm run check && npm test` green, or the switch to standard mode is recorded (section 7.2).
- `git tag -a phase0 -m 'phase0'`, then `git push origin main --follow-tags`.

**toolchain-ok (WS1, day 1-3)**
- BlocksDS installed by `scripts/install-toolchain.ps1`.
- `samples/hello` builds and `packRom()`'s header check passes.
- `dsdude play` boots it in melonDS and DeSmuME, with `DSD|LOG|hello` captured live (flush pad) or at graceful Stop.
- `dsdude screenshot` returns a PNG.
- WS1 records `toolchain-ok: passed <date> <commit>` at the top of `docs/status/ws1.md`. After merging that commit, WS0 tags `toolchain-ok` on main and pushes it with `git push origin main --follow-tags`.
- This gate releases WS3 into slot 2 (hybrid; also upgraded mode). In the standard-mode fallback, WS3 starts at M0 in slot 1.

**M0 Hello from Play**
- `dsdude play samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets` runs the real `BuildService`, packs with ndstool and launches melonDS with its window visible. `DSD|LOG|hello` arrives live.
- Stop closes the emulator (`taskkill /PID`, then `/F` after 2 s) and leaves no orphan process.
- The same works with the DeSmuME profile.
- Hybrid and upgraded mode also require two things. First, the Electron IDE's **Play** runs the real `BuildService` on `samples/hello` with `--runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets` (as in section 6 WS6), with the line shown in the Output panel. Second, WS3's selftest ROM passes its screenshot checks (128 sprites per screen, two scrolling backgrounds) and logs touch input and a maxmod effect.
- Standard-mode fallback: the IDE part moves to M3 and the selftest part to M1.

**M1 First bytecode on the DS**
- `runtime/dist/arm9.elf` loads `hello.dsdb` from NitroFS, compiled by WS4 or hand-assembled from `fixtures/bytecode/hello.dsda`. It prints `DSD|READY` and `DSD|LOG|hello` exactly once each on both emulators.
- `dsdude-host` passes conformance v0 and v1 with deterministic traces, against the same goldens when built with Linux gcc (WS2's cloud session) and with MSYS2 UCRT64 gcc (`mingw32-make -f runtime/Makefile.host test`, WS0 locally).
- Compiler output is byte-identical to the goldens and round-trips through `dsdb-dis`.
- An ABI-hash mismatch shows the friendly message.
- **VM microbenchmark (hard gate):** >= 35,000 typed simple ops per full 1,120,380-cycle frame (<= 32 cycles/op).
  - Op mix, from `fixtures/bytecode/bench.dsda`: 40% tag-checked ADD/SUB/MUL, 30% MOV/LOADI/GETSLOT/SETSLOT, 20% CMPJ/JMP, 10% CALLN/RET.
  - The bytecode is a >= 4 KB straight-line block in main RAM.
  - Timing uses cascaded hardware timers (ticks x 2 = ARM9 cycles) on melonDS with JIT off.
  - melonDS models no load-use interlocks, no D-cache and no shifted-offset penalty (`docs/research/verification.md` claim 4), so the melonDS figure must be >= 44,000 unless one hardware run calibrates the derating.
  - Below the gate, WS2 first adds int-specialised opcodes (reserved in C2) that the compiler emits when the checker proves both operands are int.
- The same run compares `-mlong-calls` with plain BL for builtin calls from the dispatch loop and keeps the faster one. `npm run build:runtime` reports `.itcm` usage within the 24 KB ceiling.
- Standard-mode fallback also: WS3's selftest checks from M0.

**M2 Sprite moves from a script via CLI**
- `dsdude play samples/minimal` runs the whole path: PNG + `.dss` → assets → compile → ndstool → melonDS.
- The D-pad moves the sprite at 60 fps, shown by `DSD|STAT` plus a `dsdude screenshot --keys` sequence.
- A deliberate runtime error prints `DSD|ERR` with object/event/file/line and draws the bottom-screen error box.
- The host trace and the melonDS log agree.
- Ownership of `samples/minimal` and `samples/flappy` passes from WS4 to WS7.

**M3 IDE Play end to end**
- Monaco has completion, hover, signature help and live diagnostics for DSS.
- Play runs the real pipeline in the build worker. `samples/flappy` plays in melonDS from the IDE in under 3 s warm, with the emulator window visible and the Controls card shown on the first Play.
- Compile and runtime diagnostics land in Problems with click-to-line.
- Meters update live from `DSD|MEM`/`DSD|STAT`.
- Stop works, and the Playwright smoke test is green.
- Standard-mode fallback also: the M0 IDE criteria.

**M4 Feature-complete 0.1**
- The full v1 event set and all ~90 builtins run on host and DS with golden traces (conformance tiers v0-v4).
- Collisions, alarms, `with`/`other`, arrays, strings, room transitions with per-room asset sets, both screens, touch, sound effects and music.
- Sprite/object/room/background/sound editors in the real shell; the Learn panel shows the manual and the tutorial.
- Templates boot (screenshot check), and the DeSmuME fallback works.
- 300 scripted instances run at 60 fps per `DSD|STAT` (the stress fixture).
- The generated reference is complete. The 20 beginner mistakes each have a friendly message and a test.

**M5 A beginner builds Flappy Bird**
- **Testers:** at least one tester aged 12-15 with no coding background, plus an adult with GameMaker exposure if available. For minors: parental consent and screen-only recording.
- **Setup:** the electron-builder installer on a Windows profile without MSYS2. Tutorial assets are bundled (Help > Tutorial assets). A fresh Claude session walks the tutorial first.
- **Task:** follow `docs/tutorial/flappy-bird.md` from an empty project to a playable Flappy Bird, using only the IDE, with no terminal, no JSON editing and no help.
- **Success:** the bird flaps on A and on tap, pipes scroll, a collision restarts the room, and the score draws.
- **Measured separately:**
  - install to first Play of the sample: target < 5 min;
  - tutorial completion: target 30 min; the gate fails above 60 min or if any question had to be answered;
  - 15 minutes of free play with two prompts ('add a high score', 'make the pipes speed up as the score rises'), logged for confusions. Neither is already done by the tutorial code.
- The session is recorded, and every confusion becomes an issue with an owner.

**M6 Release 0.1**
- The NSIS installer bundles the tools pack and melonDS 1.1, with the GPL-3 text and the 1.1 source archive in the same GitHub Release. The first-run wizard only verifies them (SHA-256) and offers the optional DeSmuME profile. Downloads are used only for emulator updates.
- The release includes templates, generated docs, the license bundle with Corresponding Source archives (section 2.11), and an electron-updater channel on GitHub Releases (public releases and the updater provider: question 6).
- `npm run e2e` is green: py-desmume screenshot regression against goldens that py-desmume itself generated, melonDS log assertions, and Playwright.
- The installer installs offline and plays the sample on a clean Windows 11 VM without MSYS2.
- The download page documents SmartScreen's 'More info → Run anyway' unless an Authenticode certificate is budgeted (question 6).
- If a flashcart is available (question 4), the sample is verified on a real DS via Homebrew Menu or TWiLight Menu. Otherwise the release notes say it is untested on hardware.

## 9. Risk register

1. **BlocksDS/Wonderful install untested on this machine.**
   - Risks: silent Inno flags (the `.exe` defaults to admin and runs `pacman -Sy make` against the user's MSYS2); `wf-pacman --noconfirm` in non-interactive bash; the wf-pacman self-update needing a second `-Syu wf-tools`; `CHERE_INVOKING=1` being required for `bash -lc` to keep its cwd.
   - Settled: builds outside the Wonderful shell work as long as `BLOCKSDS` is always exported as a POSIX path (`docs/research/verification.md` claim 2).
   - Mitigation: tarball bootstrap with a looped, exit-code-checked wf-tools step (section 7.1), run by WS1 at hour zero with the user present; the exact `wonderful_shell.cmd` environment replicated; the Inno `.exe` with `/CURRENTUSER` as plan B (with the user's OK, since it runs `pacman -Sy make`), and devkitPro as plan C (via ADR); the SDK example ROM is the first thing built. See `docs/research/verification.md` claims 1 and 2.
2. **A missing `NitroFS!` magic or an empty NitroFS** make `nitroFSInit` return false with errno ENODEV.
   - Mitigation: `packRom()` reads the header and the 8 magic bytes directly; `game.dsdb` is always packed; ndstool and libnds are pinned to the same BlocksDS release (>= 1.14.2) in the committed `tools/tools-pack.json`; the runtime prints `strerror(errno)` in a `DSD|ERR` line when `nitroFSInit` fails.
   - ndstool's `arm7_min = 0x8000` makes FNT/FAT < 0x8000 impossible (`docs/research/verification.md` claim 3).
3. **VM too slow or too big.** ITCM is 32 KB, with a 24 KB ceiling for the VM plus hot builtins; main RAM is 4 MB. The ~24-36 cycles per typed op are hand-priced estimates (`docs/research/verification.md` claim 4).
   - Mitigation: the M1 hard gate with a melonDS derating (section 8); int-specialised opcodes reserved in C2 as the fallback; ARM-mode computed goto in ITCM (`.arm.c`, no GCSE or cross-jumping); `-mlong-calls` measured against BL; native hot paths; fixed-capacity allocators with meters; the 300-instance stress fixture at M4.
4. **Compiler/runtime semantic drift.**
   - Mitigation: one `builtins.json` and one `opcodes.json` with generators; the ABI hash refused at load; the same C core on host and DS; conformance tiers on the host at every integration and melonDS traces at every checkpoint; tiered contract changes (section 7.4).
5. **Host/DS numeric divergence.**
   - Mitigation: pure integer C11 with `-std=c11 -fwrapv -fno-strict-aliasing -funsigned-char` on both targets; cells hold 32-bit handles, never pointers; division goes through core functions that handle `den == 0` and `INT_MIN / -1`; vendored libnds trig LUTs; the core's own PRNG, sort and number formatting.
   - UBSan runs in trap mode on the host. The overflow trap uses `__builtin_*_overflow`, because `-fwrapv` disables UBSan's `+ - *` checks.
   - Phase-0 spike 12 compares host and melonDS hashes (`docs/research/verification.md` claim 11).
6. **Palette and colour limits confuse beginners.**
   - Mitigation: in-house quantization with a preview dialog; auto 16/256 mode; per-room palette counting (separate 16- and 256-colour pools); colour reduction is always a warning; actionable E4xx messages; palette groups in v1.1.
7. **Emulator debug features differ.** DeSmuME ignores the `0x04FFFAxx` registers and has no GDB stub. melonDS honours both print protocols. `windowsHide` hides a GUI emulator's window.
   - Mitigation: one print protocol chosen at boot from the emulator ID (section 5 C8; buffering is risk 20); emulators spawned without `windowsHide`; the on-device console overlay and error box; GDB only on melonDS; no node-gyp compilation and no native addons such as node-pty in v1 (section 2.5).
   - ConPTY/node-pty is not a fix, because a GUI process does not attach to a pseudo-console. It stays an optional experiment.
8. **Tools pack DLL dependencies** (ndstool/grit/mmutil from the Wonderful install). Verified: the tools are native UCRT64 PE executables and need only the four MinGW runtime DLLs from `C:\msys64\opt\wonderful\bin`; mmutil needs none (`docs/research/verification.md` claim 7).
   - Mitigation: `tools/fetch-vendor.ps1` does an objdump import walk, asserts the CRT flavour, and runs the clean-PATH test; play-time spawns in development get the same PATH prefix; the clean Windows 11 VM install test runs at M6.
9. **Licensing/redistribution** (GPL tools and emulators, proprietary mwccarm and NitroSDK templates).
   - Mitigation: separate processes; a license bundle with SHA-256s; the exact Corresponding Source archives in the same GitHub Release as the installer (section 2.11); `vendor/` gitignored from the first commit and refused by `.githooks/pre-push`, so mwccarm never reaches GitHub; MIT/Zlib for our code; devkitPro never redistributed.
10. **OneDrive sync re-enabled.** The repo stays at `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` (user decision, 2026-09-25; section 2.10). Desktop is OneDrive-redirected, but nothing syncs: the client is not running, no file is a cloud placeholder, and most OneDrive features are disabled. If Desktop sync were re-enabled, `node_modules`, `.git` and `.dsdude` would lock.
    - Mitigation: `tools/checkpoint.ps1` and `dsdude doctor` warn when `OneDrive.exe` runs and the path is under `%OneDrive%`. If the warning fires, pause the instances and turn Desktop sync off.
    - The root path is 47 characters, so `core.longpaths true` stays set and build paths stay under 250 characters.
    - Emulator state and build output live under `DSDUDE_HOME`: the gitignored `<worktree>\.dsdude` in development, `%LOCALAPPDATA%\DSDude` by default for end users.
    - User projects default to `%USERPROFILE%\DSDudeProjects`, with a warning when the chosen path is under `%OneDrive%` (section 2.10).
    - All of this is documented in `CLAUDE.md`.
11. **Front-end churn**: electron-vite 6 is beta, TS 7 has no compiler API, Monaco has 0.56+ entry points, the dockview package is split, and Electron downloads its binary lazily.
    - Mitigation: pinned versions (section 2.5); composite `tsc -b` for type-checking only; `typescript@npm:@typescript/typescript6` for any tool that needs a compiler API; Biome for lint; Monaco providers, not LSP; the root postinstall `tools/postinstall.mjs`, which runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1` (set in cloud clones); Phase-0 spike 13; revisit at M6.
12. **Concurrent instances colliding or drifting.** Memory pressure and usage limits are separate risks (17, 24).
    - Mitigation: `tools/ownership.json` enforced at WS0's integration merge (the pre-commit hook is a convenience), per commit through the `DSDude-WS:` trailer for local and cloud branches alike; worktrees with a per-worktree `DSDUDE_HOME` and ports; the lockfile regenerated only by WS0 (commit-msg hook; `tools/cloud/push.sh` repeats the check in the cloud); tiered contract changes with CHANGELOG entries; the `phase0` gate; daily integration plus time-boxed checkpoints; fixtures as executable contracts.
13. **WS0 becomes a bottleneck.**
    - Mitigation: WS0 is a persistent Claude Code instance (section 7.2), and the user's share is about 1-2 hours a day; ADR drafts carry recommended answers; T0/T1 changes need no ADR; streams continue on `// ADR-pending`, which `tools/adr-pending.ts` inventories at each checkpoint, cloud push targets included; checkpoints are time-boxed to two hours. Cloud integration is scripted: one `git fetch` per run, push targets from `docs/status/cloud.md`, and local-only failures written back as `IF-` entries.
14. **Emulator vs hardware gaps.** DeSmuME lacks the register protocol; flashcarts need argv/DLDI; neither emulator enforces the per-scanline OBJ limits; card-read timing differs; melonDS's CPU timing is optimistic.
    - Mitigation: melonDS as the reference; the legacy-signature stub for DeSmuME and hardware; docs require Homebrew Menu or TWiLight Menu; a scanline warning from `scanlineObjCycles`, set from the selftest scanline page on hardware; a real-cart test at M6, with the caveat that the user may not own a cart (question 4).
15. **Beginner UX failure (the DSGM/NESmaker pattern).**
    - Mitigation: docs generated from the compiler's tables and shown in the in-app Learn panel; the Controls card; meters instead of link errors; jargon-free diagnostics (section 5 C9); optional semicolons; the beginner-journey table as the M5 script; a real 12-15-year-old as the gate, with install-to-first-Play and free play measured; the omission list published; WS7 starting at CP-A (hybrid, cloud), CP-B (upgraded fallback) or WS2's hand-off (standard fallback), not at the end.
16. **Scope creep toward GML parity.**
    - Mitigation: the frozen v1 surface and omission list in `contracts/language.md`; new features only via ADR, and only after M5.
17. **Machine capacity and usage limits.** 11.3 GB RAM for the local instances, and one Claude plan for ~4 local + 4-5 cloud sessions (risk 24).
    - Mitigation: hybrid mode (section 7.2), in which only the streams that need Windows tools run locally, at the standard-mode limits (at most 4 instances including WS0, one Electron dev IDE and one emulator window machine-wide, per-instance limits); the memory gate (minimum available memory > 1.5 GB); the stagger and fallback rules (section 7.2); the 32 GB upgrade (the upgraded-mode fallback).
18. **melonDS under-reads VM cost** by ~20-30%.
    - Mitigation: a derated gate (>= 44,000 ops per frame on melonDS), and a hardware calibration if a cart exists.
19. **Line endings** (system `core.autocrlf=true`).
    - Mitigation: `.gitattributes` and repo config in Phase 0; every cloud session's first command sets `core.autocrlf false`; the Phase-0 test asserts LF checkout of Makefiles and hooks.
20. **Emulator stdout** is block-buffered, and dual protocols duplicate lines on melonDS.
    - Mitigation: the protocol is chosen from the emulator ID, plus the flush pad; a graceful Stop flushes the tail.
21. **GRF/MAS/NitroFS format coupling** between tools and libraries.
    - Mitigation: pin grit/mmutil/ndstool together with libnds/libmm9 from one BlocksDS release in the committed `tools/tools-pack.json`, and rebuild assets on upgrade.
22. **Cloud environment drift**: image changes, the network allowlist, and the setup-script cache expiring after ~7 days.
    - Mitigation: the setup script pins Node `v24.16.0`; `tools/cloud/start.sh` fails fast without Node 24 and npm 11 and prints the versions; WS0 lists them per cloud stream in each checkpoint report; setup-script changes go through a WS0 ADR.
23. **Lockfile platform binaries.** WS0 generates `package-lock.json` on Windows, and cloud clones install it on Linux. Verified 2026-09-25 (npm 11.13, Node 24.16, Linux simulated with `--os/--cpu/--libc`): a clean Windows lockfile records the linux-x64 glibc variant of rollup, esbuild, biome, TS 7, tailwind oxide, lightningcss and `@napi-rs/lzma`. Deleting the lockfile while `node_modules` exists silently drops the 11 `@tailwindcss/oxide-*` entries, and `npm install` does not repair that.
    - Mitigation: only WS0 regenerates the lockfile, on Windows, with `npm install` while the lockfile exists, and never deletes it while any `node_modules` exists; the guard `tools/check-lockfile.mjs` runs in commit-msg, `tools/checkpoint.ps1`, `start.sh` and `push.sh`; cloud sessions use `npm install` (never `npm ci`) and restore the lockfile after it; `start.sh` smoke-tests the Linux native binaries; if the guard fails in the cloud, the stream records `BLOCKER lockfile` and bridges with `npm install --no-save <missing>@<version>`, never `--force`.
24. **Usage limits**: ~9 concurrent sessions on one plan.
    - Mitigation: question 3 before the tag; WS0 asks again at each checkpoint; the shedding order is WS6b first, then WS7 and WS5 wait for a free cloud slot, then the standard-mode fallback (section 7.2).
25. **Linux gcc vs MSYS2 gcc** for the host build: GCC 13 vs 15.2, LP64 vs LLP64, the `.exe` suffix, stack size, text-mode I/O.
    - Mitigation: the `runtime/Makefile.host` rules (identical flags `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char`; `ifeq ($(OS),Windows_NT)` only for `EXE := .exe`; no `-Werror`; fixed-width integers only; `-fsanitize=undefined -fsanitize-trap=undefined` on both; no reliance on more than 1 MB of stack) and the shared goldens in `fixtures/conformance/expected/**`, which WS0 also runs with `mingw32-make -f runtime/Makefile.host test` at every integration. Linux green alone is never done.
26. **Ephemeral cloud sessions**: a reclaimed VM keeps the conversation but loses processes and unpushed files.
    - Mitigation: push every green batch with `bash tools/cloud/push.sh` and never end a turn with unpushed work; all state lives in the stream's branch and `docs/status/wsN.md`; a session resumes with `bash tools/cloud/start.sh` and "continue from docs/status/wsN.md" (section 7.5).
27. **GitHub or push availability**: an outage, a revoked GitHub App, or HTTP 403 on pushes to any branch but the session's own.
    - Mitigation: `push.sh` tries the recorded target, `wsN-<name>`, `claude/wsN-<name>` and then the session's own branch, and records the one that works; WS0 fast-forwards `wsN-<name>` to each merged tip, so replacement sessions start there; the local repo stays the source of truth, since integration never needs GitHub; the fallback rule (section 7.2); the `vendor/` pre-push guard.
28. **Linux-only passes hide Windows failures**: path separators, case, CRLF, process spawning.
    - Mitigation: WS0 runs `npm run check && npm test` on Windows at every integration, and each local-only failure becomes an `IF-` entry under `## Integration feedback` in the stream's `docs/status/wsN.md`, which the stream fixes first.

## 10. Open questions for the user

Answered on 2026-09-25: location (the repo stays in place, section 2.10), operating mode (hybrid, section 7.2) and names (confirmed: DSDude, DSS `.dss`, DSDB). They go into the Day-0 answers line of WS0's start prompt (`docs/kickoff/ws0.md`).

Questions 1 and 2 are needed on Day 0 and question 3 before the tag. Questions 4, 5 and 6 can wait until the milestones they name.

1. **BlocksDS install consent.** May WS1 install BlocksDS into `C:\msys64` with you present? It takes ~30 min: ~177 MB download, ~591 MB installed under `C:\msys64\opt\wonderful`. The tarball bootstrap needs no UAC prompt and does not touch your MSYS2 packages. The same session installs py-desmume 0.0.9 for headless screenshots (`python -m pip install --user py-desmume==0.0.9`). You give consent by launching WS1 on Day 0 and approving its prompts.
2. **GitHub.** Cloud sessions clone from GitHub, so the repo needs a private `origin`.
   - Create it on Day 0 (either route in section 7.1; no instance creates it) and give WS0 its URL.
   - Approve the Claude GitHub App for that repo only: `https://github.com/apps/claude/installations/new`, **Only select repositories** set to `dsdude`. The App gets read/write access to Actions, Contents, Issues, Pull requests and Workflows, and GitHub allows no subset. Without the App, `claude --cloud` uploads a bundle instead of cloning.
3. **Usage limits.** Does your Claude plan cover ~4 local + 4-5 cloud sessions at once (the peak, from CP-B)? If not, the cloud streams are staggered: WS6b is dropped first (WS6 then builds the editors), then WS7 and WS5 wait for a free cloud slot. If that is still not enough, WS0 switches to the standard-mode fallback (section 7.2).
4. **Flashcart and DS model.** Do you own a DS flashcart (which one), and a DS, DS Lite or DSi? The answer decides two things:
   - whether M6 includes a real-hardware check or ships as "untested on hardware";
   - whether one hardware run can calibrate the melonDS derating of the M1 gate and set `scanlineObjCycles`.
5. **The M5 tester.** Is someone aged 12-15 with no coding background available for a recorded session of about 60-90 minutes (install, tutorial, 15 minutes of free play)?
   - Timing: around week 10-11 in hybrid mode (week 9-10 in the upgraded fallback, week 15-17 in the standard fallback).
   - For a minor: parental consent and screen-only recording.
   - If possible, also an adult with GameMaker exposure.
6. **Public releases and the unsigned installer** (decide by M6; the repo stays private until then).
   - Will releases be public on GitHub? electron-updater's GitHub Releases provider assumes it, and the GPL source archives must sit in the same Release as the installer.
   - Is unsigned-installer SmartScreen friction acceptable for 0.1? Code signing would be a later decision.
