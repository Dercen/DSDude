# Checkpoint 2: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `7fd898f`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-2. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 2 | 3 | **merged** as `4995f55` | Test Files  41 passed (41); Tests  284 passed (284) |
| WS4 | cloud | `ws4-compiler@e899c34` | 4 | 26 | **merged** as `23fa06f` | Test Files  45 passed (45); Tests  322 passed (322) |
| WS2 | cloud | `ws2-runtime-core@2b51ae1` | 8 | 24 | **refused** | ownership:  ?:  |
| WS3 | local | `ws3-platform` | 4 | 3 | **merged** as `07cdf10` | Test Files  46 passed (46); Tests  330 passed (330) |
| WS5 | cloud | `ws5-assets@8dc1314` | 2 | 1 | **merged** as `f127b82` | Test Files  46 passed (46); Tests  330 passed (330) |
| WS6 | local | `ws6-ide` | 2 | 2 | **merged** as `5a00398` | Test Files  53 passed (53); Tests  362 passed (362) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@e899c34` | 26 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@2b51ae1` | 24 | refused | - | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@8dc1314` | 1 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest |

## Local checks (Windows)

- lockfile regenerated and committed (guard passed)
- npm run check && npm test (Windows): green; Test Files  53 passed (53); Tests  362 passed (362)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp2-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- WS2: ownership failed: `node tools/check-ownership.ts --range main..origin/ws2-runtime-core --stream WS2` ->  ?: 

## Memory and ADR-pending

- Memory: 36 samples since 2026-09-26T07:24:41-06:00: minimum available 1376 MB at 2026-09-26T07:42:43; peak commit charge 17.3 GB at 2026-09-26T07:42:43; gate FAIL
- ADR-pending inventory: main;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713, tools/screenshot.py:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26; ws1-toolchain;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0003: tools/screenshot.py:11; origin/ws2-runtime-core;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713; origin/ws4-compiler;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713; origin/ws5-assets;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS1: merged ws1-toolchain (2 commits)
- WS4: merged ws4-compiler@e899c34 (4 commits)
- WS3: merged ws3-platform (4 commits)
- WS5: merged ws5-assets@8dc1314 (2 commits)
- WS6: merged ws6-ide (2 commits)
