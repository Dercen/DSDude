# Checkpoint 1: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `b23a325`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-1. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 8 | 2 | **merged** as `06e370e` | Test Files  31 passed (31); Tests  141 passed (141) |
| WS4 | cloud | `ws4-compiler@5fab99f` | 2 | 4 | **merged** as `8282fbb` | Test Files  34 passed (34); Tests  216 passed (216) |
| WS2 | cloud | `ws2-runtime-core@9308b03` | 2 | 4 | **merged** as `4f9cbcd` | Test Files  34 passed (34); Tests  216 passed (216) |
| WS6 | local | `ws6-ide` | 1 | 4 | **merged** as `df24e55` | Test Files  41 passed (41); Tests  284 passed (284) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@5fab99f` | 4 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@9308b03` | 4 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |

## Local checks (Windows)

- lockfile regenerated and committed (guard passed)
- npm run check && npm test (Windows): green; Test Files  41 passed (41); Tests  284 passed (284)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp1-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 281 samples since 2026-09-25T23:51:10-06:00: minimum available 224 MB at 2026-09-26T07:06:06; peak commit charge 17.7 GB at 2026-09-25T23:58:11; gate FAIL
- ADR-pending inventory: main;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS1: merged ws1-toolchain (8 commits)
- WS4: merged ws4-compiler@5fab99f (2 commits)
- WS2: merged ws2-runtime-core@9308b03 (2 commits)
- WS6: merged ws6-ide (1 commits)
