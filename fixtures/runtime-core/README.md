# fixtures/runtime-core

Inputs and fingerprints for WS2's host runs of whole games (docs/kickoff/ws2.md, definition of done).

- `flappy-keys.txt`: the key script of the DoD run
  `dsdude-host <flappy build>/nitrofs --frames 600 --seed 1 --input fixtures/runtime-core/flappy-keys.txt --trace out.jsonl`
  (format: contracts/log-protocol.md "Key scripts"). The flap frames come from a lookahead search over `dsdude-host`
  runs of WS4's compiled `fixtures/compiler/samples/flappy.dsdb`, so the bird passes pipes and scores (three lives,
  one point each): the run covers scoring, pipe deaths, Outside Room and `room_restart`.
- `flappy-trace.fnv`: FNV-1a 32 fingerprints of that `flappy.dsdb` (with its header's ABI hash field zeroed, so a
  T1 append to `contracts/builtins.json` does not retire it) and of the 600-frame trace it gives with the key
  script and `--seed 1`. The host tests (`runtime/tests/test_programs.c`) require two identical runs and, while the
  dsdb fingerprint matches, the trace fingerprint too, so the Linux and MinGW builds must agree byte for byte (the
  DoD's cross-compiler identity check). When WS4 regenerates `flappy.dsdb`, the test prints a note with the new
  fingerprints and skips the trace comparison; WS2 then checks the new trace and copies the printed lines here.
- `flappy-nitrofs/`: WS0's row (GRFs and soundbank built locally with grit/mmutil); not written by WS2. The host's
  results do not depend on it: game logic takes sprite geometry from the DSDB (ADR-0006), never from GRFs.
- `v4-screens/`: a NitroFS directory for the host renderer (`--png-dir`, tier v4). `game.dsda` (and the generated
  `game.dsdb`) is one room with a scrolled background on both screens, a plain, a mirrored (frame 1) and a rotated
  (45 degrees, scale 2) 16x16 8bpp sprite, an 8x8 4bpp sprite, a 64x64 sprite on the bottom screen, `draw_text` and
  a filled `draw_rectangle`. The GRFs are copies of WS3's selftest grit output
  (`fixtures/runtime/selftest/nitrofs`, made from `fixtures/runtime/selftest/src/*.png` with the C3 grit lines):
  `gfx/spr16.grf` sha256 `6202600c...`, `gfx/spr8x8.grf` `96dd084c...`, `gfx/spr64.grf` `fca15594...`,
  `bg/bg.grf` `69512af1...`. A second room, `rm_pan` (reached by `room_goto` at the end of frame 3), shows `spr64` over the
  background on the top screen with a view that pans 3 pixels right and 1 down per Step, and nothing on the bottom
  screen. `runtime/tests/check_screens.mjs <frame-1 dir> <frame-5 dir>` compares both renders with the source PNGs
  (178,856 pixels exact; the rotated sprite within the DS's corner sampling), and `test_screens` pins them by hash.
