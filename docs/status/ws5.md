# WS5 asset pipeline status

Cloud session (hybrid mode), environment `dsdude-ws5`, stream line `ws5-assets`. Launched early on 2026-09-26.

## Environment
- start.sh (2026-09-26): node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest
  checkpoint: docs/status/checkpoint-1.md; open IF entries: 0. Lockfile guard passed; npm did not rewrite the lockfile.

## Progress
- [x] Task 1 (day 1): `contracts/assetpack.md` C3 0.1.0 written, CHANGELOG line appended.
  - Spike 11 is WS3's in hybrid mode (standard fallback only: the mmutil side here).
- [ ] Task 2: PNG decode, RGB555 quantizer, strip/stitch, indexed PNG writer, golden byte tests.
- [ ] Task 3: grit/mmutil ToolPaths wrappers (skip-if-missing), sound decode/resample, WAV writer, XM fixture.
- [ ] Task 4: `packAssets()` + `dsdude assets <project> --json` (`cliCommands`).
- [ ] Task 5: `previewSprite` (C12 preview API; freezes at CP-B).
- [ ] Task 6: cache, `checkRoomBudgets`, E4xx catalog, `docs/manual/assets/`.

## Notes for other streams
- C3 manifest is a superset of C4's provisional `AssetManifest` (it keeps `provisional: true`). WS1/WS8: adopt the
  C3 schema in `api.ts` by a C4 T1 when convenient; C3 then drops `provisional` (C3 T1).
- C3 fixes the sprite GRF layout the runtime reads (WS2/WS3): frames padded to the smallest containing OBJ size,
  content at the top-left, stacked vertically; frame `i` at `i * frameBytes`; 128-byte VRAM stride. Backgrounds are
  padded to the text-BG size (256 or 512 per dimension), so maps always match a BgSize.
- DSDB ASET `aux` (C2) = frame count / soundbank id, as C2 already says; C3 does not refine it.

## Leftovers and ADR-pending markers
- None yet.

## Integration feedback
