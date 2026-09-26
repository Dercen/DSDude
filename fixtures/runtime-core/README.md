# fixtures/runtime-core

Inputs for WS2's host runs of whole games (docs/kickoff/ws2.md, definition of done).

- `flappy-keys.txt`: the key script of the DoD run `dsdude-host <flappy build>/nitrofs --frames 600 --seed 1 --input
  fixtures/runtime-core/flappy-keys.txt --trace out.jsonl` (format: contracts/log-protocol.md "Key scripts"). The
  host tests already run it against WS4's compiled `fixtures/compiler/samples/flappy.dsdb` twice and require
  identical traces; the trace becomes a golden once sprite geometry reaches the DSDB (ADR-0003 sprite geometry).
- `flappy-nitrofs/`: WS0's row (GRFs and soundbank built locally with grit/mmutil); not written by WS2.
