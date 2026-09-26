# Building the DS runtime

How to rebuild `runtime/dist/` (the C8 runtime artifact, `contracts/runtime-artifact.md`). Local Windows machine
only: it needs BlocksDS 1.24.0 in `C:\msys64\opt\wonderful`. Owner: WS3.

## Build

From the repo root (or a worktree root), in PowerShell with the CLAUDE.md env block set:

```powershell
npm run build:runtime -w runtime             # make -j$DSDUDE_MAKE_JOBS (8 if unset), then VERSION + report
npm run build:runtime -w runtime -- --jobs 4
```

It prints the make output, then the memory report:

```
build:runtime: runtime\dist\arm9.elf (runtime 0.1.0, abi 0dd9987a)
itcm   1088 B (1.1 KB of 24.0 KB)
dtcm   0 B (0.0 KB of 4.5 KB reserved)
cstack 11200 B (10.9 KB)
image  92692 B (90.5 KB of 716.8 KB)
```

Exit 2 means BlocksDS is missing, make failed (E640, or E604 after 10 minutes), or a budget was exceeded (ITCM over
24 KB, DTCM data over `__dtcm_data_size`, the image over 0.7 MB).

Commit `runtime/dist/arm9.elf`, `arm9-debug.elf` and `VERSION` **together with the sources they were built from**:
`VERSION`'s `tree` is then the committed `runtime/` tree without `dist/`.

## Make directly

`bash.exe -lc` with `CHERE_INVOKING=1` and single-quoted inner strings (PowerShell 5.1 mangles double quotes):

```powershell
Set-Location runtime
C:\msys64\usr\bin\bash.exe -lc 'make -j4'             # dist/arm9.elf + dist/arm9-debug.elf, no VERSION
C:\msys64\usr\bin\bash.exe -lc 'make -j4 DSD_VM_BL=1' # M1 switch: vm.arm.c with plain BL instead of -mlong-calls
C:\msys64\usr\bin\bash.exe -lc 'make clean'           # removes runtime/build/ (dist/ stays)
```

Switching `DSD_VM_BL` needs a `make clean` first (make does not track flag changes).

## Try it in an emulator

Pack any NitroFS folder with a `game.dsdb` around the fresh ELF, then run it headless or in an emulator:

```powershell
npx dsdude build fixtures/runtime/dsdb-hello --runtime runtime/dist/arm9.elf --skip-compile --skip-assets
npx dsdude screenshot <printed game.nds> --frames 90 --out .dsdude\shots\hello --json   # log + top/bottom PNGs
npx dsdude play fixtures/runtime/dsdb-hello --no-build --emulator melonds             # one emulator machine-wide
```

`fixtures/runtime/dsdb-hello/nitrofs/game.dsdb` is `fixtures/bytecode/hello.dsda`, assembled by
`node tools/gen-dsdb.ts`.

## Debugging

`arm9-debug.elf` has the symbols: `dsdude play --debug` starts melonDS's GDB stub, then
`gdb-multiarch -ex "file runtime/dist/arm9-debug.elf" -ex "target remote localhost:3333"`; a crash address resolves
with `arm-none-eabi-addr2line -e runtime/dist/arm9-debug.elf <addr>`.
