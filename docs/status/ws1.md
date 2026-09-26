# WS1 status: Toolchain, build driver and Play

Mode: **hybrid**, local slot 1. Launched 2026-09-25 (Day 1, evening). `toolchain-ok`: not yet.

## Progress

Legend: todo / in progress / done (<sha>).

- Task 1. Install (hour zero, user present): **done**
  - BlocksDS 1.24.0 installed from the Wonderful tarball into `C:\msys64\opt\wonderful` by a background Node script (spike 4 below), 2026-09-25 22:35-22:37 local. No UAC prompt; MSYS2 packages untouched.
  - Installed check: `C:\msys64\opt\wonderful\bin\wf-config` and `...\thirdparty\blocksds\core\tools\ndstool\ndstool.exe` both exist.
  - melonDS 1.1 zip SHA-256 `9F3F8A24...F8C8` matches; extracted to `<DSDUDE_HOME>\emulators\melonDS-1.1\`.
  - DeSmuME 0.9.13: `DeSmuME_0.9.13_x64.exe` (SHA-256 `1CA4E771...CF32C`) copied to `<DSDUDE_HOME>\emulators\desmume-0.9.13\`.
  - `python -m pip install --user py-desmume==0.0.9`: installed (cached wheel `py_desmume-0.0.9-cp313-cp313-win_amd64.whl`).
  - `python -m pip show Pillow`: `pillow 12.2.0`, user site `...\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\LocalCache\local-packages\Python313\site-packages` (same site as py-desmume).
  - **The user confirmed that the example ROM shows its background in melonDS** (2026-09-25; `graphics_2d/bg_regular_8bit`, see Deviations).
  - `scripts/install-toolchain.ps1`: every step exit-code checked and time-limited (30 min for `blocksds-toolchain`), idempotent. Tested: the re-run path end to end (exit 0), and its bash helper for exit 0, exit 1 and a 1-min timeout (tree killed, error names `db.lck`). The fresh-install path ran as the Node spike, not through the script.
- Task 2. `toolchain-ok`: todo (next)
- Task 3. CLI polish: todo
- Task 4. `BuildService`: todo
- Task 5. Spike 5 + `dsdude doctor`: todo

## Deviations from PLAN.md (for WS0)

- **`examples/graphics_2d/bg_regular_nitrofs` has no Makefile in BlocksDS 1.24.0.** It builds with `python3 build.py` (ArchitectDS), which is not installed, so the PLAN 7.1 line `cd $BLOCKSDS/examples/graphics_2d/bg_regular_nitrofs && make` fails with `make: *** No targets specified and no makefile found.` 18 SDK examples use `build.py`, 167 use a Makefile. Substitutes (no extra install): `graphics_2d/bg_regular_8bit` for the "background shows" check, and `filesystem/nitrofs` + `maxmod/nitrofs` for NitroFS. PLAN 7.1 (Day-0 block, spike 6) and `scripts/smoke-test.ps1` should name these.
- The versions print as `v1.24.0-dirty` (ndstool, grit, mmutil and `core/version.txt`), so version checks match `v1.24.0` as a prefix.
- `arm-none-eabi-gcc` is not on the login shell's PATH: it is `C:\msys64\opt\wonderful\toolchain\gcc-arm-none-eabi\bin\arm-none-eabi-gcc.exe`; the BlocksDS Makefiles use the full path. `detectToolchain()` checks that path.
- The install took ~70 s, not ~30 min: 163.99 MiB download, 549.65 MiB installed for `blocksds-toolchain` + `blocksds-docs`.
- Examples are built from copies under `%TEMP%`, so the SDK tree stays pristine.

## Spike results

### Spike 3: `bash.exe -lc pwd` from Node with SHLVL removed (claim 2): PASS
```
CHERE_INVOKING=unset status=0 out="/home/zache\nSHLVL=1"
CHERE_INVOKING=1     status=0 out="/c/Users/zache/OneDrive/Desktop/Projects/DSDude-ws1\nSHLVL=1"
```
Without `CHERE_INVOKING=1` the login shell runs `cd $HOME`, as claim 2 says.

### Spike 4: the install driven from Node (claim 1): PASS
Every step spawned `C:\msys64\usr\bin\bash.exe -lc <step>` with the section 7.1 env, SHLVL removed, `windowsHide` and a timeout; every exit code was 0.

| Step | Exit | Seconds |
|---|---|---|
| extract bootstrap tarball (4,885,826 bytes, SHA-256 `551E5B30...2DE6`) | 0 | 1.1 |
| wf-tools run 1 | 0 | 6.1 |
| wf-tools run 2 | 0 | 6.0 |
| `wf-config repo enable blocksds` | 0 | 0.8 |
| `wf-pacman -Syu --noconfirm` (after enable) | 0 | 1.5 |
| `wf-pacman -S --noconfirm blocksds-toolchain blocksds-docs` | 0 | 51.5 |
| `wf-pacman -Syu --noconfirm` (verify) | 0 | 1.4 |

wf-tools run 1 (upgrades only wf-pacman, exits 0 without wf-tools, as claim 1 says):
```
:: Synchronizing package databases...
 wonderful downloading...
:: Starting core system upgrade...
Packages (1) wf-pacman-7.1.0-3
Total Download Size:    3.63 MiB
...
upgrading wf-pacman...
:: Run wf-pacman again in order to finish the upgrade.
```
wf-tools run 2 (no further core update):
```
:: Synchronizing package databases...
 wonderful downloading...
:: Starting core system upgrade...
 there is nothing to do
:: Starting full system upgrade...
Packages (10) wf-lua-5.4.8-5  wf-lua-filesystem-1.8.0.r352.912e067-1  wf-lua-iconv-7.1.r101.5452834-1  wf-lua-libdeflate-0.0.1.r3.d34711a-1  wf-lua-penlight-1.15.0.r950.c317508-1  wf-lua-plum-0.0.1.r9.6a60edc-1  wf-lua-toml-0.4.0.r47.44a4056-1  wf-tools-lua-0.1.0.r183.ad72e38-1  wf-tools-native-0.1.0.r180.3bf0d29-1  wf-tools-0.2.0-3
Total Download Size:   0.81 MiB
...
installing wf-tools...
```
`-Syu` after `wf-config repo enable blocksds` (no core update):
```
:: Synchronizing package databases...
 blocksds downloading...
 wonderful downloading...
:: Starting core system upgrade...
 there is nothing to do
:: Starting full system upgrade...
 there is nothing to do
```
Installed: `blocksds-toolchain 1.24.0-1`, `blocksds-docs 1.24.0-1`, `toolchain-gcc-arm-none-eabi-gcc 1~16.2.0.r229124.be93d9d35bf-1`, `toolchain-gcc-arm-none-eabi-binutils 2.47-2`, `toolchain-gcc-arm-none-eabi-picolibc-generic 1.8.12.r26255.40c274b4a-1`, `runtime-gcc-libs 0.1.0-14`, `wf-pacman 7.1.0-3`, `wf-tools 0.2.0-3`.
Versions: `arm-none-eabi-gcc.exe (Wonderful toolchain) 16.2.0`; `ndstool v1.24.0-dirty`, `grit v1.24.0-dirty`, `mmutil v1.24.0-dirty`.

### Spike 2: melonDS 1.1 from Node, with and without `windowsHide` (claim 6): PASS
`spawn(melonDS.exe, [rom], {stdio: 'pipe', windowsHide})`, checked after 4 s with `IsWindowVisible(MainWindowHandle)`:
```
windowsHide=false hwnd=9570628 visible=True title=[60/60] melonDS 1.1   graceful taskkill /PID: exit 0 after 651 ms
windowsHide=true  hwnd=0       visible=False title=                     graceful taskkill /PID: exit 0 after 582 ms
```
Emulators must spawn without `windowsHide`. On first launch melonDS writes `melonDS.toml` and `rtc.bin` next to the exe.

### Spike 6: `make VERBOSE=1 -j4` from Node, SHLVL removed (claim 2): PASS
Section 6 WS1 env, `CHERE_INVOKING=1`, run in copies under `%TEMP%\dsdude-spikes\examples`:

| Example | Exit | Seconds | ROM |
|---|---|---|---|
| `graphics_2d/bg_regular_8bit` | 0 | 4.1 | `bg_regular_8bit.nds`, 120,320 bytes |
| `filesystem/nitrofs` | 0 | 2.6 | `fs_nitrofs.nds`, 165,888 bytes |
| `maxmod/nitrofs` | 0 | 3.4 | `maxmod_nitrofs.nds`, 722,944 bytes |

The ROM is named after the Makefile's `NAME`, not the folder.

### Spikes 5, 7, 8, 9: todo (task 2 / task 5)
