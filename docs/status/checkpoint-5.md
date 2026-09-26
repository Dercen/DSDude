# Checkpoint 5: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `1533c4c`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-5. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS5 | cloud | `ws5-assets@83d3eed` | 5 | 32 | **refused** | npm test red on Windows:        \|                                  ^ /     159\|       "spr_tiny and spr_Tiny differ only in capital letters, and the D… /     160\|     ); / ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯ |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS5 | `ws5-assets@83d3eed` | 32 | refused | - | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind origin/main |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  58 passed (58); Tests  477 passed (477)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- screenshot: skipped (--no-screenshot)

## Integration feedback appended

- WS5: npm test on Windows after merging failed: `npm test` ->        |                                  ^ /     159|       "spr_tiny and spr_Tiny differ only in capital letters, and the D… /     160|     ); / ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

## Memory and ADR-pending

- Memory: 2 samples since 2026-09-26T08:35:30-06:00: minimum available 3955 MB at 2026-09-26T08:36:37; peak commit charge 13.8 GB at 2026-09-26T08:36:37; gate PASS
- ADR-pending inventory: main;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713, tools/screenshot.py:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26; origin/ws2-runtime-core;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713, tools/screenshot.py:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26

## Run log

- fetch: ok
