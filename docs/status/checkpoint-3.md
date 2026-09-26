# Checkpoint 3: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `ab70443`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-3. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS2 | cloud | `ws2-runtime-core@ded8080` | 5 | 45 | **merged** as `ab70443` | Test Files  53 passed (53); Tests  362 passed (362) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS2 | `ws2-runtime-core@ded8080` | 45 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  53 passed (53); Tests  362 passed (362)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- screenshot: skipped (--no-screenshot)

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 5 samples since 2026-09-26T08:01:11-06:00: minimum available 3829 MB at 2026-09-26T08:02:02; peak commit charge 13.6 GB at 2026-09-26T08:02:02; gate PASS
- ADR-pending inventory: main;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713, tools/screenshot.py:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26; ws1-toolchain;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713, tools/screenshot.py:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26; origin/ws2-runtime-core;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713; origin/ws4-compiler;   ADR-0003: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716; origin/ws5-assets;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS2: merged ws2-runtime-core@ded8080 (5 commits)
