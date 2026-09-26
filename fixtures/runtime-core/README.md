# fixtures/runtime-core

Inputs and fingerprints for WS2's host runs of whole games (docs/kickoff/ws2.md, definition of done).

- `flappy-keys.txt`: the key script of the DoD run
  `dsdude-host <flappy build>/nitrofs --frames 600 --seed 1 --input fixtures/runtime-core/flappy-keys.txt --trace out.jsonl`
  (format: contracts/log-protocol.md "Key scripts"). The flap frames come from a lookahead search over `dsdude-host`
  runs of WS4's compiled `fixtures/compiler/samples/flappy.dsdb`, so the bird passes pipes and scores (three lives,
  one point each): the run covers scoring, pipe deaths, Outside Room and `room_restart`.
- `flappy-trace.fnv`: FNV-1a 32 fingerprints of that `flappy.dsdb` and of the 600-frame trace it gives with the key
  script and `--seed 1`. The host tests (`runtime/tests/test_programs.c`) require two identical runs and, while the
  dsdb fingerprint matches, the trace fingerprint too, so the Linux and MinGW builds must agree byte for byte (the
  DoD's cross-compiler identity check). When WS4 regenerates `flappy.dsdb`, the test prints a note with the new
  fingerprints and skips the trace comparison; WS2 then checks the new trace and copies the printed lines here.
- `flappy-nitrofs/`: WS0's row (GRFs and soundbank built locally with grit/mmutil); not written by WS2. The host's
  results do not depend on it: game logic takes sprite geometry from the DSDB (ADR-0006), never from GRFs.
