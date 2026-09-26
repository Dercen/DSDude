# fixtures/runtime/selftest

The selftest ROM's NitroFS root, its inputs, key scripts and golden screenshots (WS3; docs/kickoff/ws3.md task 3,
spikes 10 and 11). The ROM itself is built from `runtime/selftest/source/` plus the platform layer by
`runtime/Makefile` with `DSD_SELFTEST=1`; it needs no core, compiler or asset pipeline.

| Path | What | Made by |
|---|---|---|
| `src/` | Indexed PNGs (magenta at index 0), `blip.wav` (copy of `fixtures/assets/blip.wav`), `loop.wav` (a 16-bit mono tone with a `smpl` loop), `selftest.xm` (2 channels, 1 pattern, 1 looped sample) | `runtime/selftest/make_assets.py` |
| `nitrofs/gfx/*.grf`, `nitrofs/bg/bg.grf` | grit 1.24.0 output with the PLAN.md 2.9 lines: `spr16` (16x16 x 3 frames, 8bpp), `spr8x8` (4bpp, `-gB4 -pn16`), `spr64` (64x64, 8bpp), `bg` (256x192 text BG, 8bpp) | same |
| `nitrofs/soundbank.bin` | mmutil 1.24.0: `blip.wav loop.wav selftest.xm -d -o... -h...` (WAVs by name, then modules) | same |
| `nitrofs/big.bin` | 1 MB, byte i = `(i * 7 + (i >> 8)) & 0xFF`, byte sum 133693440, for the timed read | same |
| `commands.txt` | Every command line the script ran, its exit code, `mmutil -V` | same |
| `keys/*.txt` | Key scripts (ADR-0003 format) for the screenshot cases | by hand |
| `golden/<case>-{top,bottom}.png` | py-desmume screenshots the cases must match pixel for pixel | `npm run selftest -w runtime -- --update` |

`runtime/selftest/source/soundbank.h` (the mmutil header) is written by the same script. Re-running
`python runtime/selftest/make_assets.py` reproduces every file byte for byte (checked 2026-09-26).

## Checking

`npm run selftest -w runtime` builds the ROM, runs each case of `runtime/src/selftest-cases.ts` through
`dsdude screenshot`, compares the PNGs with the goldens and the `DSD|` log with the case's patterns, and on the boot
case checks spike 10: the background rows and sprite 0 show the source PNGs' colours exactly at RGB555. The screen
at boot is still (animation is on B), because py-desmume is not cycle-exact between runs and anything that moves
could land one frame off.

In an emulator window:
`npx dsdude build fixtures/runtime/selftest --runtime runtime/build/dsdude_selftest.elf --skip-compile --skip-assets`,
then `npx dsdude play fixtures/runtime/selftest --no-build --emulator melonds --seconds 10`.
