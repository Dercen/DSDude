# Emulator integration for the Play button (melonDS, DeSmuME)

*Research report 3 of 6, produced 2026-09-24 during DSDude planning. Reference material only; see `docs/research/README.md`.*

---

# Emulator integration for a one-click "Play" button (Windows / Electron)

## 0. Bottom line

**Default emulator: melonDS 1.1 (Windows x86_64 release zip), launched as a separate process by the IDE.** It needs no BIOS/firmware (verified: a bare 64 KB test ROM I generated booted at 60/60 fps with zero system files), takes the ROM as a positional argument plus `-f` for fullscreen, reads a single `melonDS.toml` next to the exe that the IDE can fully generate (important: melonDS ships with **no key bindings at all**, every `Keyboard.*` key is `-1`), has a built-in GDB stub that I verified listening on TCP 3333/3334, and forwards no$gba-style debug prints from the ROM to stdout, which the IDE can capture. It is GPL-3.0; because the IDE only `exec`s it, this is "mere aggregation" and does not affect the IDE's license.

**DeSmuME 0.9.13 as an optional secondary target** (for Lua scripting, Ctrl+F12 screenshots, `--start-paused`, `--windowed-fullscreen`, and `py-desmume` headless CI screenshots). But the official Windows binary has **no GDB stub** (verified: the exe contains no gdbstub strings, and `--arm9gdb 3333` makes it exit with code 1), ships **no `lua51.dll`**, does **not** implement the 0x04FFFAxx debug registers that modern libnds/BlocksDS use, and the last release is from 2022-05-23.

**In-window WebAssembly preview (EmulatorJS `nds` core) is feasible but should be phase 2**: it needs COOP/COEP headers for SharedArrayBuffer, uses an older libretro melonDS core, has no GDB/log capture, and embedding GPL-3 JS in the renderer makes the IDE a derivative work.

All test artifacts are in the scratchpad: `C:\Users\zache\AppData\Local\Temp\claude\C--Users-zache-OneDrive-Desktop-Projects-DSDude\957dcbd6-e6b3-4e38-9787-f65a383d1ec3\scratchpad\` (`mkrom.py`, `test rom\dsdude test.nds`, `melon\melonDS.exe` + generated `melonDS.toml`, `node_pipe_test.js`, `test_melon.ps1`, `test_dsm.ps1`, downloaded sources under `src\`). No emulator processes were left running; the `%LOCALAPPDATA%\DeSmuME` folder my DeSmuME test created was removed. The user's `C:\Users\zache\Downloads\desmume-0.9.13-win64\desmume.ini` was not touched (I ran a copy of the exe from the scratchpad).

---

## 1. melonDS

### Versions and downloads
- Latest stable: **1.1**, published 2025-11-18 (GitHub API). Windows assets: `melonDS-1.1-windows-x86_64.zip` (19,484,283 bytes, contains a single `melonDS.exe` of 43,520,000 bytes) and `melonDS-1.1-windows-aarch64.zip` (12,552,465 bytes). URL: `https://github.com/melonDS-emu/melonDS/releases/download/1.1/melonDS-1.1-windows-x86_64.zip`.
- Nightly: master head is commit `906e9ebb` (2026-08-23). Official nightly page `https://melonds.kuribo64.net/nightlies.php` links `nightly/<run-id>/melonDS-windows-x86_64.zip` with SHA256 per build; the GitHub Actions artifact is also reachable via `https://nightly.link/melonDS-emu/melonDS/workflows/build-windows/master/melonDS-windows-x86_64` (zip). Nightlies are built with `configurePreset: release-windows-x86_64`, `-DENABLE_DEBUG_DEPS=OFF -DMELONDS_EMBED_BUILD_INFO=ON`.
- Changes since 1.0 relevant to us: 1.1 fixed the GDB stub `vCont` packet bug and a DLDI driver header bug; PR #2399 (merged 2025-08-10, so in 1.1) added 8-bit writes to the no$gba debug registers, which is what current devkitARM libnds `consoleDebugInit(DebugDevice_NOCASH)` + `fprintf(stderr, ...)` uses (issue #2374).

### Command line (verified with `melonDS.exe --help`)
```
melonDS.exe [options] nds gba
  -b, --boot <auto/always/never>   boot firmware on startup; "auto" = boot if NDS rom given
  -f, --fullscreen                 start in fullscreen
  -a, --archive-file <rom>         file to load inside an archive (NDS)
  -A, --archive-file-gba <rom>     same for GBA slot
  -h, --help / --help-all
```
That is the entire CLI (`src/frontend/qt_sdl/CLI.cpp`). There are no flags for window size, layout, GDB or screenshots; everything else comes from `melonDS.toml`. ROM paths with spaces: just pass them as one argument. Verified: `melonDS.exe "C:\...\test rom\dsdude test.nds"` loaded and ran ("[60/60] melonDS 1.1" window title). From Node/Electron use the args array so no quoting is needed at all. melonDS's Windows entry point takes UTF-8 argv from SDL's WinMain, so non-ASCII paths are fine.

Launching a second `melonDS.exe` while one is running opens a second *instance* (Instance1) sharing the same TOML, so the Play button must kill (or `CloseMainWindow`) the previous child before relaunching. There is no IPC/"reload ROM" channel.

### Config file location (verified)
The official Windows build is compiled with `PORTABLE=ON` (`WIN32_PORTABLE`, `src/frontend/qt_sdl/CMakeLists.txt`): **`melonDS.toml` lives next to `melonDS.exe`** (my test wrote it to the exe folder, nothing appeared under `%APPDATA%`). If a *directory* named `portable` exists next to the exe, that directory is used instead (`pathInit()` in `main.cpp`). Non-portable builds use `%APPDATA%\melonDS\`. A legacy `melonDS.ini` is imported if present. The file is written on clean exit or on settings change; a hard `TerminateProcess` loses it (harmless when the IDE owns the file, but write your config before launch, not after). melonDS also writes `rtc.bin` next to the config and puts `<rom>.sav` and savestates `<rom>.ml1..ml8` next to the ROM, so build ROMs into a `build/` directory.

### Config keys the IDE should write (from `Config.cpp` defaults + a real generated file)
```toml
LimitFPS = true
TargetFPS = 60.0
FastForwardFPS = 1000.0
AudioSync = false
PauseLostFocus = false

[3D]
Renderer = 0            # 0 Software (default), 1 OpenGL, 2 OpenGL-compute (GPU3D.h)

[Screen]
UseGL = false           # keep false: avoids the Win11 OpenGL issues listed below
Filter = true
VSyncInterval = 1

[Emu]
ConsoleType = 0         # 0 DS, 1 DSi
DirectBoot = true       # default; boots the ROM straight in
# Emu.ExternalBIOSEnable absent/false -> FreeBIOS + generated firmware (no files needed)

[DLDI]                  # optional "SD card" for libfat/FAT homebrew; melonDS auto-patches DLDI
Enable = false
ImagePath = "dldi.bin"
ImageSize = 0           # index: 0 auto, 1 256MB, 2 512MB, 3 1GB, 4 2GB, 5 4GB
ReadOnly = false
FolderSync = false
FolderPath = ""         # host folder mirrored into the image

[Instance0.Window0]
Enabled = true
ScreenLayout = 0        # 0 Natural, 1 Vertical, 2 Horizontal, 3 Hybrid
ScreenRotation = 0      # 0/1/2/3 = 0/90/180/270 deg
ScreenSizing = 0        # 0 Even, 1 EmphTop, 2 EmphBot, 3 Auto, 4 TopOnly, 5 BotOnly
ScreenGap = 0           # 0..500 px
ScreenSwap = false
IntegerScaling = true
ScreenFilter = false
ShowOSD = false
# Geometry = "<Qt base64 blob>"  -> window size/pos is a Qt saveGeometry blob; leave it out

[Instance0.Audio]
Volume = 256            # 0..256

[Instance0.Keyboard]    # Qt::Key codes OR'd with modifier bits; -1 = unbound (the shipped default!)
A = 88                  # X
B = 90                  # Z
X = 83                  # S
Y = 65                  # A
L = 81                  # Q
R = 87                  # W
Start = 16777220        # Qt::Key_Return 0x01000004
Select = 16777248       # Qt::Key_Shift  0x01000020 (left shift)
Up = 16777235           # 0x01000013
Down = 16777237         # 0x01000015
Left = 16777234         # 0x01000012
Right = 16777236        # 0x01000014
HK_FullscreenToggle = 16777274   # F11 (0x0100003A)
HK_Pause = 16777216 + 0x30       # F0-style example: Escape is 16777216; F-keys 0x01000030.. ; set as you like
HK_FastForward = 16777217        # Tab
HK_Reset = -1
HK_FrameStep = -1

[Instance0.Gdb]
Enabled = true          # key is "Enabled" (issue #2144 shows "Enable" is ignored)
[Instance0.Gdb.ARM9]
Port = 3333
BreakOnStartup = false
[Instance0.Gdb.ARM7]
Port = 3334
BreakOnStartup = false
```
(Key-code note: melonDS stores `event->key() | event->modifiers()`; letters are their uppercase ASCII, arrows/Return/Shift are the Qt constants above. Remove the illustrative `HK_Pause` line or set it to a real code such as `16777264` = F1.) The GUI equivalents: Config > Input and hotkeys; Config > Emu settings > Devtools ("Enable GDB stub", "Break on startup").

### Booting homebrew, NitroFS, DLDI
- FreeBIOS + DirectBoot is the default; no `bios7.bin/bios9.bin/firmware.bin` needed for DS-mode homebrew (verified with the generated ROM). DSi mode needs real files.
- NitroFS: libnds/BlocksDS `nitroFSInit()` falls back to the official slot-1 card-read protocol when not launched through an argv-capable loader; per the BlocksDS FAQ "on emulators this can be done by using the official cartridge access protocol", so no DLDI or SD image is required. (Not testable here: no DS toolchain with libnds is installed yet.)
- FAT/SD homebrew: enable `[DLDI]` with `FolderSync = true` and point `FolderPath` at a project folder; melonDS patches the DLDI driver into the ROM automatically.

### GDB stub (verified)
- Compiled in by default (`ENABLE_GDBSTUB ON` in root `CMakeLists.txt`); release builds include it.
- With the TOML block above, `melonDS.exe "<rom>"` listens on **0.0.0.0:3333 (ARM9) and 0.0.0.0:3334 (ARM7)**. Important: the sockets are created when the NDS core starts running a ROM; with the emulator idle (no ROM) nothing listens. Use `BreakOnStartup = true` to halt at the entry point so the debugger can set breakpoints.
- Client: a GDB with ARM support. **`C:\msys64\ucrt64\bin\gdb-multiarch.exe` (17.1) is already installed** on this machine (`pacman -Ss gdb` shows `mingw-w64-ucrt-x86_64-gdb-multiarch [installed: 17.1-3]`). devkitARM here has no gdb. Session (from the BlocksDS debugging guide):
  ```
  gdb-multiarch
  (gdb) file build/game.elf
  (gdb) target remote localhost:3333
  (gdb) break main
  (gdb) continue
  ```
  Use separate GDB sessions for ARM9 and ARM7. Disable the JIT (`[JIT] Enable = false`) while debugging; the interpreter is what the stub was written against.

### Capturing printf/console output from the ROM
melonDS implements the no$gba debug registers in `NDS.cpp`: `0x04FFFA10` String Out (raw), `0x04FFFA14` String Out with `%r0%..%pc%/%scanline%/%frame%/%totalclks%` substitution, `0x04FFFA18` same plus newline, `0x04FFFA1C` Char Out (8- and 32-bit). ARM9 gets all four; the ARM7 write path only handles Char Out. Everything is printed through `Platform::Log` -> `vprintf` -> **stdout**, and Debug-level lines are printed in the release build (my capture shows the Debug "Opened ..." lines). melonDS does **not** implement the legacy `mov r12,r12` / `"no$gba debug"` signature that older libnds and DeSmuME use (no such code in `ARM*.cpp`).

Windows specifics (`main.cpp`): the exe is a GUI-subsystem app. At startup, if `GetStdHandle(STD_OUTPUT_HANDLE)` is already valid (Electron `spawn` with `stdio: 'pipe'` or a redirect), it is used as-is; otherwise it calls `AttachConsole(ATTACH_PARENT_PROCESS)` and reopens `CONOUT$`, else stdout goes to `NUL`. Verified from Node 24: `spawn(exe, [rom], {stdio:['ignore','pipe','pipe'], windowsHide:true})` received the log. **Caveat: stdout is fully buffered when it is a pipe** - I got exactly one 4,158-byte chunk at +1,565 ms and nothing more until the kill at 8 s. For live output either (a) spawn melonDS under a ConPTY with `node-pty` (the GUI process then has no std handles, attaches to the pty console and console output is unbuffered), or (b) accept ~4 KB batching, or (c) rely on GDB. On-screen `consoleDemoInit()` text is of course always visible.

Homebrew side: devkitARM libnds `consoleDebugInit(DebugDevice_NOCASH); fprintf(stderr, "...")` -> Char Out; BlocksDS `nocashMessage()`/`nocashWrite()` on ARM9 (>= 1.22.2, 2026-07-25) use the register system; BlocksDS 1.24.0 (2026-09-21) fixed a >=120-char overflow in the ARM7 ASM versions.

### Screenshots, scripting, headless
- **No screenshot feature** (issues #1572 closed unimplemented, #2454 still open as of 2025-10-02) and no scripting or headless mode in the desktop app. For IDE-side screenshots use Electron `desktopCapturer` on the melonDS window, or route CI screenshot tests through DeSmuME/py-desmume (below).
- Fullscreen toggle only via `HK_FullscreenToggle` hotkey or `-f` at launch.

### Known Windows 11 issues
- #2483 (Nov 2025): freeze/crash entering fullscreen at 1440p with the OpenGL renderer; not with software rendering.
- #2211 (1.0RC): secondary windows glitch on Windows when "OpenGL display" or the GL renderer is on. -> keep `3D.Renderer = 0` and `Screen.UseGL = false` by default; the GL path needs OpenGL 3.2.
- Fresh installs have no key bindings (the IDE must write them).
- #2144: people set `Enable = true` in `[Gdb]` and nothing happens; the key is `Enabled`.
- Killing the process (`child.kill()`) is fine but skips the config save.

### License
GPL-3.0-or-later (source headers).

---

## 2. DeSmuME 0.9.13 (Windows x64)

### Versions
- Release `release_0_9_13`, 2022-05-23; asset `desmume-0.9.13-win64.zip` (6,086,795 bytes). The user's copy at `C:\Users\zache\Downloads\desmume-0.9.13-win64\` contains `DeSmuME_0.9.13_x64.exe` (40,140,800 bytes), `README.WIN`, `ChangeLog`, `COPYING` (GPL v2), `desmume.ddb`, and folders `Battery/ Cheats/ Roms/ StateSlots/ AviFiles/`. **No `lua51.dll`.**
- Git is still active (last commit 2026-09-11) but there has been no release since 0.9.13. Windows nightlies: `https://nightly.link/TASEmulators/desmume/workflows/build_win/master/desmume-win-x64` (MSBuild `Release|x64` with clang-cl, so still no GDB stub; that needs the `Dev+` configuration).

### Command line (from `desmume/src/commandline.cpp`, matches the shipped exe)
ROM is positional (`argv[optind]`), quote it. Verified: `DeSmuME_0.9.13_x64.exe --start-paused "C:\...\test rom\dsdude test.nds"` -> "Emulation paused ... Loading ... was successful", window title `DeSmuME 0.9.13 x64 SSE2`.
```
--start-paused                 --load-slot N (0-9)     --play-movie F.dsm   --record-movie F.dsm
--windowed-fullscreen          (Windows only; borderless full screen; Alt+Enter toggles at runtime)
--gpu-resolution-multiplier N  (Windows only; high-res 3D)
--3d-render SW|AUTOGL|GL|OLDGL --frameskip N  --disable-sound  --disable-limiter  --num-cores N
--jit-enable  --jit-size 1-100 --advanced-timing  --rigorous-timing  --gamehacks  --spu-synch  --spu-method 0|1|2
--console-type FAT|LITE|IQUE|DEBUG|DSI
--bios-arm9 F --bios-arm7 F --firmware-path F --firmware-boot 0|1 --bios-swi --lang N
--slot1 RETAIL|RETAILAUTO|R4|RETAILNAND|RETAILMCDROM|RETAILDEBUG  --slot1-fat-dir DIR  --preload-rom
--cflash-image IMG  --cflash-path DIR  --gbaslot-rom F
--scanline-filter-a..d N  --backupmem-db  --rtc-day D  --rtc-hour H  --advanscene-import PATH  --help
```
`--arm9gdb PORT` / `--arm7gdb PORT` exist only `#ifdef GDB_STUB`; the shipped exe rejects them (exit code 1 within ~1 s, no window). There is **no** `--lua-file`, `--screenshot`, `--scale`, `--horizontal` or `--nojoy` on Windows (those three are GTK-only). Unknown options make the process exit silently.

### Config: `desmume.ini`
Written with `WritePrivateProfile*` **next to the exe**, except when the exe path starts with `%TEMP%`, in which case it uses `%LOCALAPPDATA%\DeSmuME\desmume.ini` (verified: running my scratchpad copy created that folder). Never run DeSmuME from a temp dir. Keys worth presetting:
```ini
[Video]
Window Size=2                 ; 0 = custom (uses Window width/height), 1..5 = Nx, 65535 = 1.5x, 65534 = 2.5x
Window Rotate=0               ; 0/90/180/270
LCDsLayout=0                  ; 0 vertical, 1 horizontal, 2 one LCD
LCDsSwap=0
Display Method=1              ; 1 DirectDraw HW (default), 2 DirectDraw SW, 3 OpenGL
Window Pad To Integer=1
Window Force Ratio=1
VSync=0
[3D]
Renderer=2                    ; 1 OpenGL 3.2, 2 SoftRasterizer (default), 3 old OpenGL
PrescaleHD=1
[Display]
ScreenGap=0
Display Fps=0
Non-exclusive Fullscreen Mode=1
[Console]
Show=0                        ; 1 pops a console window (AllocConsole) unless a parent console exists
[Controls]                    ; Windows virtual-key codes; defaults shown
Left=37
Right=39
Up=38
Down=40
Start=13
Select=161
A=88
B=90
X=83
Y=65
L=81
R=87
[Hotkeys]
QuickScreenshot=123           ; F12 with "QuickScreenshot MOD"=1 (Ctrl) by default; SaveScreenshotas=123 (F12)
[PathSettings]
Screenshots=C:\path\to\project\screenshots
format=%f_%s_%r
defaultFormat=0               ; 0 PNG, 1 BMP
Roms=...  Battery=...  States=...  Lua=...  AviFiles=...
[Emulation]
CPUmode=0                     ; JIT off (default)
[Scripting]
AutoLoad=0
Recent Lua Script 1=
```

### Boot, NitroFS, DLDI
HLE BIOS by default; no system files needed (verified boot). Slot-1 auto-selects "Retail MC+ROM", which serves the card-read commands NitroFS uses. For libfat/DLDI homebrew use `--slot1 R4 --slot1-fat-dir "C:\project\sdcard"` (DeSmuME requires manual DLDI patching per BlocksDS docs).

### Capturing ROM output
`arm_instructions.cpp`: on every ARM `b`, if the previous word is `0xE1A0C00C` (`mov r12,r12`) and the halfword after the branch is `0x6464` ("dd" of "no$gba debug"), `NocashMessage()` prints the string with `%r0%..%r15%/%sp%/%lr%/%pc%/%scanline%/%frame%/%totalclks%` substitution via `printf` + `fflush(stdout)`. SWI `0xFC` ("ideas" log) prints the string at r0. The `0x04FFFAxx` registers are **not** implemented, so devkitARM `fprintf(stderr)` and BlocksDS >= 1.22.2 ARM9 `nocashMessage()` print nothing in DeSmuME. Output goes to stdout: when the IDE spawns with pipes, DeSmuME keeps the pipe (`OpenConsole` only redirects when stdout is `FILE_TYPE_UNKNOWN`), and nocash prints are flushed immediately; generic log lines are buffered until exit (verified capture through a redirect).

### Lua, screenshots, headless
- Lua 5.1 scripting is in the Windows build (File > Lua Scripting > New Lua Script Window) but `DemandLua()` needs `lua51.dll` (x64 Lua 5.1 from LuaBinaries, renamed) beside the exe. API: `emu.frameadvance/pause/unpause/speedmode/loadrom/reset/registerbefore/registerafter/registerexit`, `memory.readbyte..writedword/registerwrite/registerexec`, `joypad.set`, `stylus.set`, `gui.text/box/gdscreenshot`, `savestate.*`, `movie.*`. `gui.gdscreenshot()` returns a gd string; saving PNG needs lua-gd. Auto-run: `[Scripting] AutoLoad=1` + `Recent Lua Script 1=path`.
- Screenshots: F12 opens Save Screenshot As, **Ctrl+F12 = Quick Screenshot** into `[PathSettings] Screenshots`, PNG by default, name pattern `%f_%s_%r`.
- Headless CI: **py-desmume 0.0.9** (PyPI, GPL-3.0, win_amd64 wheels for CPython 3.8-3.14; Python 3.13.14 is on this machine): `emu = DeSmuME(); emu.open(rom); for _ in range(120): emu.cycle(); emu.screenshot().save("out.png")`, plus `emu.memory`, `emu.input.keypad_add_key(...)`, `emu.savestate`, `emu.movie`. No window required. Alternative: `--play-movie` + Ctrl+F12 hotkey automation.

### Known Windows 11 issues
- Forum "Broken screens on DeSmuME 0.9.13 (Windows 11)": corrupted output, fixed by switching Config > Display Method to OpenGL (or vice versa); GitHub #45: both OpenGL 3D renderers crash on 1st/2nd-gen Intel iGPUs -> default to SoftRasterizer.
- Not DPI-aware (blurry on scaled displays); NVIDIA high-DPI OpenGL scaling bug affects the OpenGL display method.
- Uses ANSI `__argv`: non-ASCII ROM paths may fail.
- SSE2 required; the last release predates Windows 11 24H2 and is 4 years old.

### License
GPL-2.0-or-later.

---

## 3. Embeddable / in-app options

| Option | State | Notes |
|---|---|---|
| **EmulatorJS** 4.2.3 (2025-07-05), repo active 2026-09-20, GPL-3.0 | usable | `EJS_core='nds'` -> `melonds` (default), `desmume`, `desmume2015` libretro-WASM cores. Docs list `bios7.bin/bios9.bin/firmware.bin` for melonds; the underlying libretro melonDS core has a FreeBIOS fallback in DS mode, so homebrew probably boots without them (untested). melonds needs cross-origin isolation: serve with `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (in Electron via `session.webRequest.onHeadersReceived` or a custom `protocol.handle` scheme) or `app.commandLine.appendSwitch('enable-features','SharedArrayBuffer')`. Options: `EJS_player`, `EJS_gameUrl`, `EJS_pathtodata`, `EJS_biosUrl`, `EJS_threads`, `EJS_startOnLoaded`, `EJS_defaultControls`, `EJS_volume`, `EJS_ready`, `EJS_onGameStart`. |
| DS Anywhere (brxxn) | WIP, GPL-3.0, last push 2026-06-11, 33 stars | Emscripten melonDS fork + TS bridge + Preact UI; "very much a Work-In-Progress"; no npm package. |
| desmume-wasm (44670) | stale, GPL-2.0, last push 2023-10-20 | iOS-oriented PWA at ds.44670.org; no embedding API. |

Tradeoffs: the libretro melonDS WASM core is older than desktop 1.1, has no GDB stub and no stdout capture, and WASM runs roughly 2-4x slower than native (fine for 2D homebrew, marginal for heavy 3D). Embedding GPL-3 JS in the Electron renderer creates a combined work, so the IDE (or at least that module) must be GPL-3-compatible; the separate-process native path avoids this.

---

## 4. Exact "Play" implementation

```js
// main process
const { spawn } = require('child_process');
const path = require('path');
function play(romPath, { fullscreen = false } = {}) {
  if (current) { current.kill(); current = null; }         // melonDS would otherwise open a 2nd instance
  writeMelonToml(path.join(melonDir, 'melonDS.toml'), settings); // keys from section 1
  const args = fullscreen ? ['-f', romPath] : [romPath];   // spaces in romPath are fine
  current = spawn(path.join(melonDir, 'melonDS.exe'), args, {
    cwd: melonDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  current.stdout.on('data', d => log.append(d.toString()));    // arrives in ~4 KB chunks
  current.on('exit', code => log.append(`melonDS exited (${code})`));
}
// DeSmuME variant:
// spawn(desmumeExe, ['--start-paused', romPath], { cwd: desmumeDir, stdio: 'pipe' })
```
For live logs use `node-pty`: `pty.spawn(melonExe, [romPath], { cwd: melonDir })` and stream `onData`. For debugging: write `[Instance0.Gdb] Enabled = true` + `BreakOnStartup = true`, launch, then run `C:\msys64\ucrt64\bin\gdb-multiarch.exe -ex "file build/game.elf" -ex "target remote localhost:3333"`.

Runtime debug print (works in melonDS, DeSmuME and no$gba):
```c
static inline void dbg_print(const char* s) {
    *(volatile const char**)0x04FFFA18 = s;   /* melonDS / no$gba: String Out + newline (ARM9) */
    /* plus the legacy signature for DeSmuME:  mov r12,r12 ; b 1f ; .hword 0x6464 ; .hword 0 ; .asciz "%r0%..."; 1: */
}
```
Implement both paths in the IDE's own runtime library so the choice of emulator never hides logs.

---

## 5. Licensing (GPL FAQ)
"Mere aggregation" (putting two programs side by side) is allowed; "pipes, sockets and command-line arguments are communication mechanisms normally used between two separate programs", so launching melonDS/DeSmuME via `exec` keeps the IDE independent. The IDE may auto-download the unmodified upstream zip on first run (show the license, keep the SHA256) or bundle it, in which case ship `COPYING`/the GPL text and satisfy the source obligation (store the exact upstream source archive or a link to the release tag/commit and keep it available). Do not statically link or embed emulator code in-process unless the IDE is GPL-compatible.

## 6. Test log (this machine)
1. DeSmuME `--arm9gdb 3333 --arm7gdb 3334` -> exited within 6 s, no listeners; `--arm9gdb 3333` alone -> exit code 1; no args -> runs (title "Paused"); `--start-paused` -> runs. Exe contains `windowed-fullscreen`, `gpu-resolution-multiplier`, `desmume.ini`, but not `Failed to create ARM9 gdbstub`.
2. melonDS 1.1 zip downloaded (SHA not checked), `--help` captured through a pipe; idle run wrote `melonDS.toml` beside the exe on clean close only.
3. GDB enabled via TOML: idle -> no listeners; with ROM -> `0.0.0.0:3333` and `0.0.0.0:3334` listening, title `[60/60] melonDS 1.1`, no BIOS files present.
4. Node `spawn` pipe: one 4,158-byte chunk at +1,565 ms, then nothing until kill (buffering).
5. DeSmuME copy with spaced ROM path + `--start-paused`: loaded, paused, full log captured via redirect; ini went to `%LOCALAPPDATA%\DeSmuME` because the copy lived under `%TEMP%` (removed afterwards).

## Recommendations
- Make melonDS 1.1 (melonDS-1.1-windows-x86_64.zip, 19,484,283 bytes) the default Play target; have the IDE download it on first run from the GitHub release URL (or bundle it with COPYING + a pointer to the exact source tag) into an IDE-owned folder such as %LOCALAPPDATA%\DSDude\emulators\melonDS\, never under %TEMP%.
- Generate melonDS.toml next to melonDS.exe before every launch (the official build is portable). At minimum write [Instance0.Keyboard] bindings (melonDS ships with every key = -1), [Instance0.Window0] IntegerScaling=true / ScreenLayout / ScreenSizing / ShowOSD=false, 3D.Renderer=0 and Screen.UseGL=false (avoids the Windows OpenGL issues #2483/#2211), and [Instance0.Gdb] Enabled + ARM9.Port=3333 / ARM7.Port=3334 when the user clicks Debug.
- Launch with child_process.spawn(melonExe, [romPath] or ['-f', romPath], {cwd: melonDir, stdio:'pipe', windowsHide:true}); kill the previous child first (a second launch opens a second melonDS instance). Pass the ROM path as a separate argv element so spaces need no quoting.
- For a live 'Output' panel, spawn melonDS under node-pty (ConPTY) instead of plain pipes: with pipes the CRT fully buffers stdout (measured: one 4,158-byte chunk at 1.5 s, nothing more). Plain pipes are acceptable only if delayed/batched logs are tolerable.
- Implement the IDE runtime's debug-print function to emit BOTH the no$gba register protocol (write string pointer to 0x04FFFA18 on ARM9; melonDS/no$gba) and the legacy 'mov r12,r12; b; .hword 0x6464 "no$gba debug"' signature (DeSmuME/no$gba), so logs show up regardless of emulator. Do not rely on devkitARM fprintf(stderr) for DeSmuME (it only writes 0x04FFFA1C, which DeSmuME ignores).
- Use C:\msys64\ucrt64\bin\gdb-multiarch.exe (already installed, 17.1) as the debugger backend: 'file build/game.elf; target remote localhost:3333; continue'. Start the GDB stub with BreakOnStartup=true and connect only after the ROM is running (the sockets do not exist while melonDS is idle). Disable the melonDS JIT while debugging.
- Offer DeSmuME 0.9.13 as an optional secondary emulator (auto-download desmume-0.9.13-win64.zip, 6,086,795 bytes) for users who want Lua, Ctrl+F12 screenshots, --start-paused or --windowed-fullscreen; write its desmume.ini next to the exe ([Video] Window Size, LCDsLayout, Display Method, [Controls] VK codes, [PathSettings] Screenshots=<project>/screenshots, defaultFormat=0). Do NOT advertise GDB or Lua for the stock DeSmuME build: the official exe has no GDB stub and ships no lua51.dll.
- For CI/screenshot regression tests use py-desmume 0.0.9 (pip install py-desmume; win_amd64 wheels for Python 3.8-3.14): DeSmuME().open(rom); cycle() N frames; screenshot().save('x.png'). It is headless and Python is already installed; melonDS has no screenshot or headless mode at all.
- Defer the in-window preview panel to a later phase. If built, use EmulatorJS (GPL-3.0) with EJS_core='nds' in a <webview>/iframe served from a custom Electron protocol that adds Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, and test whether the melonds core boots homebrew without bios7/bios9/firmware; isolate it as a separately-licensed GPL module.
- Because NitroFS-on-emulator and the debug-print paths could not be exercised here (no libnds/BlocksDS installed yet), add a 'smoke test' task to the toolchain work item: build the hello-world ROM with NitroFS + a debug print, run it in melonDS from the IDE, and assert that the string appears on stdout and that GDB can attach on 3333.
- Keep emulator runtime files out of the project source tree: melonDS writes <rom>.sav and <rom>.ml1..ml8 next to the ROM and rtc.bin next to its config, DeSmuME writes Battery/StateSlots folders; build ROMs into build/ and set DeSmuME [PathSettings] to IDE-owned folders.

## Verified facts
- [high] melonDS 1.1 was published 2025-11-18; Windows assets are melonDS-1.1-windows-x86_64.zip (19,484,283 bytes, contains only melonDS.exe 43,520,000 bytes) and melonDS-1.1-windows-aarch64.zip (12,552,465 bytes); master head is commit 906e9ebb dated 2026-08-23. (source: GitHub API https://api.github.com/repos/melonDS-emu/melonDS/releases/latest and /commits; zip extracted locally)
- [high] melonDS CLI is exactly: positional 'nds' and 'gba' ROM paths, -b/--boot auto|always|never, -f/--fullscreen, -a/--archive-file, -A/--archive-file-gba, -h/--help, --help-all. (source: Ran melonDS.exe --help locally; src/frontend/qt_sdl/CLI.cpp)
- [high] The official melonDS Windows build is portable: melonDS.toml is created next to melonDS.exe (PORTABLE=ON -> WIN32_PORTABLE); a directory named 'portable' next to the exe overrides; non-portable builds use %APPDATA%\melonDS. The config is written on clean exit, not on hard kill. (source: src/frontend/qt_sdl/CMakeLists.txt lines 197-203, main.cpp pathInit(); local run generated the file in the exe folder only after CloseMainWindow)
- [high] melonDS ships with no default key bindings: every Instance0.Keyboard.* and Joystick.* key defaults to -1; keys are stored as Qt key codes OR'd with modifier bits. (source: Config.cpp DefaultInts {"Instance*.Keyboard", -1}; generated melonDS.toml; EmuInstanceInput.cpp getEventKeyVal())
- [high] melonDS.toml window keys: Instance0.Window0.ScreenLayout (0 Natural,1 Vertical,2 Horizontal,3 Hybrid), ScreenRotation (0..3 = 0/90/180/270), ScreenSizing (0 Even,1 EmphTop,2 EmphBot,3 Auto,4 TopOnly,5 BotOnly), ScreenGap 0..500, IntegerScaling bool, ScreenSwap, ShowOSD; 3D.Renderer 0 Software/1 OpenGL/2 OpenGL compute; DLDI.Enable/ImagePath/ImageSize(0 auto,1 256MB..5 4GB)/ReadOnly/FolderSync/FolderPath. (source: src/frontend/ScreenLayout.h enums; src/GPU3D.h; Config.cpp legacy map; EmuInstance.cpp imgsizes[])
- [high] melonDS boots a DS-mode ROM with no BIOS/firmware files (FreeBIOS + DirectBoot defaults): a generated 64 KB test ROM ran at 60/60 fps with zero system files present. (source: Local test with scratchpad/test rom/dsdude test.nds; EmuInstance.cpp FreeBIOSGetNtrArm9/7 when Emu.ExternalBIOSEnable is false)
- [high] melonDS GDB stub: enabled by [Instance0.Gdb] Enabled=true with [Instance0.Gdb.ARM9] Port=3333 and [Instance0.Gdb.ARM7] Port=3334 (BreakOnStartup bool); it listens on 0.0.0.0:3333/3334 only once a ROM is running, not while idle. ENABLE_GDBSTUB is ON by default in CMake. (source: Local test (Get-NetTCPConnection showed 3333/3334 owned by melonDS with ROM, none without); EmuInstance.cpp lines 1286-1294; root CMakeLists.txt option ENABLE_GDBSTUB)
- [high] melonDS implements the no$gba debug registers 0x04FFFA10/14/18/1C (String Out raw/with params/with params+LF, Char Out) and prints them via Platform::Log -> vprintf to stdout; Debug-level logs are printed in the release build; it does NOT implement the legacy 'mov r12,r12' + "no$gba debug" signature. (source: src/NDS.cpp lines 1553, 3250, 3590-3616; Platform.cpp Log(); grep of ARM.cpp/ARMInterpreter*.cpp/ARMJIT.cpp found no signature handler; captured Debug lines locally)
- [high] On Windows melonDS keeps an inherited stdout handle (pipe/file) if present, otherwise AttachConsole(ATTACH_PARENT_PROCESS) or NUL. Node child_process.spawn with stdio 'pipe' captured its output, but fully buffered: a single 4,158-byte chunk arrived at +1,565 ms and nothing more until the process was killed at 8 s. (source: main.cpp lines 300-316; local node_pipe_test.js run with Node v24)
- [high] melonDS has no built-in screenshot feature, scripting, or headless mode; feature request #2454 (2025-10-02) is still open. (source: GitHub issues #2454 and #1572; grep of Window.cpp; search results)
- [medium] Windows-relevant melonDS issues: #2483 (crash entering 1440p fullscreen with OpenGL renderer, Nov 2025), #2211 (secondary window glitches with OpenGL on Windows, 1.0RC), #2144 (GDB not starting because 'Enable' vs 'Enabled' key). (source: GitHub issues via web search/fetch)
- [high] DeSmuME 0.9.13 was released 2022-05-23 (desmume-0.9.13-win64.zip, 6,086,795 bytes); git master is active (last commit 2026-09-11) with no newer release; Windows nightlies come from the build_win.yml workflow (Release|x64, clang-cl) via nightly.link. (source: GitHub API releases/latest and commits; .github/workflows/build_win.yml)
- [high] The official DeSmuME 0.9.13 x64 exe has no GDB stub: it lacks the 'Failed to create ARM9 gdbstub' string, and launching with --arm9gdb 3333 exits with code 1 within seconds; the flags exist only under #ifdef GDB_STUB (Dev+ configuration). (source: grep -a of DeSmuME_0.9.13_x64.exe; local launches; commandline.cpp lines 331-335; frontend/windows/main.cpp #ifdef GDB_STUB)
- [high] DeSmuME Windows CLI: ROM is positional (argv[optind]); options include --start-paused, --windowed-fullscreen (Windows only), --gpu-resolution-multiplier, --3d-render SW|AUTOGL|GL|OLDGL, --frameskip, --disable-sound, --disable-limiter, --num-cores, --jit-enable, --jit-size, --console-type, --bios-arm9/7, --firmware-path, --firmware-boot, --bios-swi, --lang, --slot1, --slot1-fat-dir, --preload-rom, --cflash-image/--cflash-path/--gbaslot-rom, --load-slot, --play-movie, --record-movie, --scanline-filter-a..d, --advanscene-import; no --lua-file. '--start-paused "path with spaces"' verified working. (source: desmume/src/commandline.cpp; local test run with scratchpad copy of the exe)
- [high] DeSmuME writes desmume.ini next to the exe, except when the exe is under %TEMP%, then %LOCALAPPDATA%\DeSmuME\desmume.ini is used. (source: frontend/windows/winutil.cpp GetINIPath(); local test created %LOCALAPPDATA%\DeSmuME when run from the scratchpad under Temp; user's copy has desmume.ini beside the exe)
- [high] DeSmuME ini semantics: [Video] Window Size 0=custom,1-5=Nx,65535=1.5x,65534=2.5x; Window Rotate 0/90/180/270; LCDsLayout 0 vertical/1 horizontal/2 one LCD; Display Method 1 DDraw HW/2 DDraw SW/3 OpenGL; [3D] Renderer 1 OpenGL3.2/2 SoftRasterizer(default)/3 old GL; [Console] Show; [Controls] Left/Right/Up/Down/Start/Select/Lid/Debug/A/B/X/Y/L/R as VK codes with defaults arrows, Enter, RShift, X, Z, S, A, Q, W; [Hotkeys] <code> and '<code> MOD'; [PathSettings] Roms/Battery/States/Screenshots/AviFiles/Cheats/SoundSamples/Firmware/Lua/Slot1D, format, defaultFormat (0 PNG/1 BMP). (source: frontend/windows/main.cpp, display.h, main.h, inputdx.cpp/.h, path.h, hotkey.cpp)
- [high] DeSmuME prints nocash messages only for the legacy signature (mov r12,r12 before a branch, 0x6464 after it) and SWI 0xFC, via printf + fflush(stdout); the 0x04FFFAxx debug registers are not implemented in MMU.cpp. With stdout redirected/piped it is used directly; a console window appears only if [Console] Show=1. (source: arm_instructions.cpp lines 3118-3124 and 6264-6267; debug.cpp NocashMessage; console.cpp OpenConsole; MMU.cpp grep; local redirect test captured the log)
- [high] DeSmuME default screenshot hotkeys: F12 = Save Screenshot As, Ctrl+F12 = Quick Screenshot to the Screenshots path; Alt+Enter toggles fullscreen. (source: frontend/windows/hotkey.cpp lines 762-774; main.cpp line 4093)
- [high] The DeSmuME 0.9.13 win64 zip contains no lua51.dll; Lua scripting requires a 64-bit Lua 5.1 DLL renamed lua51.dll next to the exe. Lua API includes emu.frameadvance/pause/speedmode/loadrom, memory.*, joypad.set, savestate.*, movie.*, gui.gdscreenshot (gd string). (source: Local directory listing; main.cpp DemandLua(); lua-engine.cpp function tables; DeSmuME forum/issue #677)
- [high] py-desmume 0.0.9 provides win_amd64 wheels for CPython 3.8 through 3.14, is GPL-3.0, and exposes DeSmuME.open(), cycle(), screenshot() -> PIL Image, memory, input, savestate, movie without needing a window. (source: PyPI simple index wheel list; desmume/emulator.py method list; GitHub API license)
- [medium] BlocksDS: recommended emulators are melonDS, DeSmuME and no$gba; NitroFS on emulators uses the official cartridge protocol (no DLDI/argv needed); ARM9 nocashMessage/nocashWrite use the register system since 1.22.2 (2026-07-25), which melonDS supports on ARM9 only; 1.24.0 (2026-09-21) fixed a >=120-char overflow. (source: https://blocksds.skylyrac.net/docs/guides/faq/ and /docs/changelog/)
- [medium] EmulatorJS 4.2.3 (2025-07-05, GPL-3.0, repo pushed 2026-09-20) offers nds cores melonds (default), desmume, desmume2015; melonds needs cross-origin isolation (COOP same-origin + COEP require-corp) for SharedArrayBuffer; docs list bios7.bin/bios9.bin/firmware.bin for melonds. (source: emulatorjs.org docs (systems/nintendo-ds, options, docs4devs/cores); GitHub API)
- [high] desmume-wasm (44670) is GPL-2.0 and last pushed 2023-10-20; DS Anywhere (brxxn) is GPL-3.0, WIP, last pushed 2026-06-11, no npm package. (source: GitHub API and READMEs)
- [high] GPL FAQ: mere aggregation of separate programs does not extend the GPL to the other program; pipes, sockets and command-line arguments are mechanisms normally used between separate programs. melonDS is GPL-3.0-or-later; DeSmuME is GPL-2.0-or-later. (source: https://www.gnu.org/licenses/gpl-faq.html; melonDS source headers; local COPYING and DeSmuME headers)
- [high] C:\msys64\ucrt64\bin has gdb 17.1 and gdb-multiarch 17.1 installed (mingw-w64-ucrt-x86_64-gdb-multiarch [installed: 17.1-3]). (source: pacman -Ss gdb output on this machine)

## Open questions
- NitroFS in both emulators could not be exercised because no libnds/BlocksDS toolchain is installed yet; BlocksDS docs also mention that one example 'won't work in melonDS if built with devkitPro due to a bug in their NitroFS implementation'. Verify with the first real hello-world ROM (melonDS 1.1 and DeSmuME 0.9.13).
- Does the EmulatorJS 'melonds' WASM core boot homebrew without bios7/bios9/firmware (the docs list them; the libretro melonDS core has a FreeBIOS fallback)? Needs a quick test before committing to an in-window preview.
- Real-time log capture: confirm that node-pty (ConPTY) delivers melonDS stdout unbuffered on Windows 11 as reasoned from main.cpp (AttachConsole path); if not, the fallback is 4 KB batched pipes or GDB.
- melonDS JIT default state and its interaction with GDB breakpoints (recommend JIT.Enable=false while debugging) was not measured; confirm breakpoints/stepping work with the interpreter on this machine using gdb-multiarch 17.1.
- Whether the melonDS Windows nightly artifacts are also built with PORTABLE=ON (the preset name suggests the same CMake options as releases) - check if the IDE will offer a 'nightly' channel.
- For the DeSmuME path, which Lua 5.1 x64 DLL build is compatible with DeSmuME_0.9.13_x64.exe (LuaBinaries lua5.1 renamed to lua51.dll per forum reports) - only matters if Lua automation is offered.
- melonDS ARM7-side debug prints: NDS.cpp handles Char Out (0x04FFFA1C) in the ARM7 8-bit write path but the parameterized String Out appears ARM9-only; confirm if the IDE runtime needs ARM7 logging.
