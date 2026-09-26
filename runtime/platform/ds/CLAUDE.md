# runtime DS platform layer (WS3's brief): runtime/platform/ds

Owner: **WS3 DS platform layer + runtime ELF** (local worktree). Read `docs/kickoff/ws3.md` first, then this brief.
Generated in Phase 0; edited by WS3 since (<= 60 lines). State and progress: `docs/status/ws3.md`.

## Owned paths
- `runtime/platform/ds/**, runtime/selftest/**, runtime/data/**`
- `runtime/Makefile, runtime/dist/**`
- `runtime/package.json, tsconfig.json, vitest.config.ts, src/**`
- `fixtures/runtime/** except hello/`
- `contracts/runtime-artifact.md, docs/manual/runtime-build.md`
- The full, authoritative list is `tools/ownership.json`; WS0's integration refuses commits outside it.

## Contracts
| Contract | Files | Version | Role |
|---|---|---|---|
| C11 platform seam | `runtime/core/include/dsd_platform.h` | 0.3.0 (frozen at CP-A) | consumer (`src/ds_plat.c`) |
| C8 runtime artifact | `contracts/runtime-artifact.md` | 0.2.0 | owner |
| C8 log protocol | `contracts/log-protocol.md` | 0.1.0 | consumer |
| C13 runtime limits | `contracts/runtime-limits.json` | 0.1.0 | consumer |

Changes follow the tiers in `contracts/README.md` (T0 doc, T1 additive + CHANGELOG, T2 ADR).

## Test before each commit
```
npm test -w runtime
npm run build:runtime -w runtime   # DSDUDE_MAKE_JOBS=4; commit dist/ with the sources it was built from
npm run selftest -w runtime        # screenshot cases vs goldens
npm run conformance:ds -w runtime  # WS2's fixtures on the DS core vs the host's .out
```

## Layout
- `src/main.c` calls `dsd_core_main` (C11 0.2.0), `ds_plat.c` implements every `dsd_plat_*`; `ds_platform.c`
  one-time init (NitroFS -> soundEnable -> mmInitDefault) and the error screen (START: longjmp to main);
  `ds_log.c` + `ds_legacy_stub.s` the C8 writer (pads after READY/ERR/STAT itself); `ds_video.c` bank table,
  BG0/BG1, OAM, ext palettes (16-bit VRAM stores only); `ds_ui.c` BG0 UI layer (font `runtime/data/font8x8.bin`,
  16 colours, panel glyphs, error box, console); `ds_gfx.c` GRF load/free LIFO, OBJ VRAM allocator, `ds_bg_load`;
  `ds_mem.c` C-stack paint/high-water, heap free.
- `runtime/selftest/` the selftest ROM (`make DSD_SELFTEST=1`), assets by `make_assets.py`.
- `runtime/src/` `build:runtime` (C4 `buildRuntime`, size/nm report, `dist/VERSION`) and `selftest` (screenshot
  cases vs goldens in `fixtures/runtime/selftest/`).
- GRF `mapAttr` is the map format (`GRF_BGFMT_SBB_8BPP`), not a bit depth.

## Gotchas
- libnds headers need `-std=gnu11` (GNU `asm`): the Makefile adds it for `platform/**` only; the core stays c11.
- PowerShell 5.1 strips double quotes inside `bash.exe -lc '...'`: put multi-step shell work in a script file.
- One emulator machine-wide: check `Get-Process electron, melonDS, DeSmuME*`; else `dsdude screenshot` headless.

## Rules
- Import other packages only through their `src/index.ts` or a declared subpath; relative imports carry `.ts`.
- Erasable TypeScript only (no enums, namespaces, parameter properties); `tsc -b` checks it.
- Tests: `vitest run --pool=threads --maxWorkers=2`, never watch mode; a timeout on every spawned process.
- Never commit `package-lock.json`; `npm install`, never `npm ci`.
