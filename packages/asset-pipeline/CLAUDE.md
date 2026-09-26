# @dsdude/asset-pipeline: packages/asset-pipeline

Owner: **WS5 Asset pipeline** (cloud session, environment `dsdude-ws5`). Read `docs/kickoff/ws5.md` first, then this brief.
State and next steps: `docs/status/ws5.md`.

## Owned paths
- `packages/asset-pipeline/**` (incl. src/diagnostics/catalog.ts)
- `fixtures/assets/** except golden/`
- `contracts/assetpack.md`
- `docs/manual/assets/**`
- The full, authoritative list is `tools/ownership.json`; WS0's integration refuses commits outside it.

## Contracts
| Contract | Files | Version | Role |
|---|---|---|---|
| C3 asset pack | `contracts/assetpack.md` | 0.1.0 | owner (T1 after day 1; T2 co-signed by WS2, WS3, WS4, WS6) |
| C4 toolchain API | `packages/toolchain/src/api.ts` | 0.5.0 | implementer: `packAssets`, `checkRoomBudgets`, `cliCommands` |
| C12 preview API | `packages/asset-pipeline/src/preview.ts` | 0.1.0 | owner (freezes at CP-B; WS6's ipc-contract checks the types field by field) |
| C1 project format | `contracts/project-format.md`, `packages/project-format` | 0.1.0 | consumer |
| C9 diagnostics | `contracts/diagnostics.md` | 0.1.0 | consumer; owns E400-E489 |
| C13 runtime limits | `contracts/runtime-limits.json` | 0.1.0 | consumer (`src/limits.ts` repeats the values; a test enforces equality) |

## Layout
- `src/image/`: pure PNG codec (fflate), RGB555, quantizer, sprite/background/icon conversion.
- `src/sound/`: pure WAV reader/writer, effect decode/resample, soundbank.h/.bin readers, tracker checks.
- `src/preview-sprite.ts`, `src/budgets.ts`, `src/manifest.ts`, `src/diagnostics/catalog.ts`: pure.
- `src/pack/` (Node): `packAssets`, cache, grit/mmutil wrappers. `src/cli.ts` (Node): `dsdude assets`.
- `src/browser.ts` = the `./browser` subpath: everything pure (a test forbids Node imports below it).
- `scripts/make-fixtures.ts` regenerates `fixtures/assets/tune.xm` and `loop-stereo-44k.wav`.

## Test before each commit
```
npm test -w packages/asset-pipeline
npx tsc -b packages/asset-pipeline
```
Goldens live in `fixtures/assets/expected/`; `DSDUDE_UPDATE_GOLDENS=1` rewrites them (review the diff). WS0 also runs
the tests on Windows, where `src/pack/real-tools.test.ts` uses the real grit/mmutil.

## Rules
- Import other packages only through their `src/index.ts` or a declared subpath; relative imports carry `.ts`.
- Erasable TypeScript only (no enums, namespaces, parameter properties); `tsc -b` checks it.
- Tests: `vitest run --pool=threads --maxWorkers=2`, never watch mode; a timeout on every spawned process.
- Determinism: integer maths after decoding, no `Math.random`, goldens compared as bytes.
- Never commit `package-lock.json`; `npm install`, never `npm ci`.
