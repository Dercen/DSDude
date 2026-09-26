# Checkpoint 6: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `a84d828`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-6. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 78 | **up to date** | no new commits |
| WS3 | local | `ws3-platform` | 0 | 3 | **up to date** | no new commits |
| WS4 | cloud | `ws4-compiler@74e0b26` | 4 | 3 | **merged** as `cae2ec2` | batch: Test Files  70 passed (70); Tests  581 passed (581) |
| WS2 | cloud | `ws2-runtime-core@70084c9` | 7 | 0 | **merged** as `cae2ec2` | batch: Test Files  70 passed (70); Tests  581 passed (581) |
| WS5 | cloud | `ws5-assets@1e438f3` | 7 | 5 | **merged** as `cae2ec2` | batch: Test Files  70 passed (70); Tests  581 passed (581) |
| WS6 | local | `ws6-ide` | 1 | 0 | **merged** as `cae2ec2` | batch: Test Files  70 passed (70); Tests  581 passed (581) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@74e0b26` | 3 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@70084c9` | 0 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@1e438f3` | 5 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind origin/main |

## Local checks (Windows)

- lockfile regenerated and committed (guard passed)
- npm run check && npm test (Windows): green; Test Files  70 passed (70); Tests  581 passed (581)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp6-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 36 samples since 2026-09-26T08:37:28-06:00: minimum available 3767 MB at 2026-09-26T09:12:13; peak commit charge 13.8 GB at 2026-09-26T09:12:13; gate PASS
- ADR-pending inventory: main;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; origin/ws2-runtime-core;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS4: merged ws4-compiler@74e0b26 (4 commits)
- WS2: merged ws2-runtime-core@70084c9 (7 commits)
- WS5: merged ws5-assets@1e438f3 (7 commits)
- WS6: merged ws6-ide (1 commits)
