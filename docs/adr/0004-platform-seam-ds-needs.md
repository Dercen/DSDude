# ADR-0004: What the DS platform layer needs from C11 before the CP-A freeze

- Status: **proposed** (WS3, 2026-09-26). WS0 numbers, merges and closes it (renumber if 0004 is taken).
- Affected streams: WS2 (owns C11 `runtime/core/include/dsd_platform.h`, the R5xx catalog
  `runtime/core/diagnostics/catalog.json` and C8 `log-protocol.md`), WS3 (implements C11 on the DS).
- Sources: PLAN.md 5.2 C8 and C11, 3.3; `docs/kickoff/ws3.md` tasks 1-2; `contracts/runtime-artifact.md`.
- Markers: `// ADR-pending ADR-0004` in `runtime/platform/ds/src/main.c`, `ds_boot_stub.c`, `ds_platform.h`.

## Context

WS3's first runtime build (`runtime/dist`, 2026-09-26) boots on the DS, mounts NitroFS, starts maxmod and prints
`DSD|READY` through the C8 writer. `dsd_platform.h` is owed by CP-A (D+3, 2026-09-28), and PLAN.md 5.2 C11 leaves
four things open that the DS side has to decide today. Each is marked in the code and listed here so WS2 can settle
them in the header rather than WS3 guessing.

## Decision (recommended)

1. **Entry point.** The core exports `int dsd_core_main(void)`, which runs the whole game (it calls `dsd_plat_init`,
   loads `game.dsdb`, prints `DSD|READY`, and loops `dsd_plat_frame_begin` / frame / `dsd_plat_frame_end`). Each
   platform's `main()` only calls it: `runtime/platform/ds/src/main.c` (WS3) and the host runner (WS2).
   `dsd_core_main` re-initialises every piece of core state, so the platform may call it again to restart (START on
   the error box). Until it exists, `ds_boot_stub.c` checks the DSDB header and prints `DSD|READY`.
2. **Log lines.** `dsd_plat_log(const char *line)` takes one whole `DSD|` line without `\n`, at most 1022
   characters. The **core** formats every line and applies the C8 text rules (splitting LOG/ERR text on `\n` and at
   the length limit, dropping `\r`, `|` to `/` inside fields), so host and DS print identical text. The **platform**
   only writes the line, and on the DS appends the flush pad after `DSD|READY`, `DSD|ERR` and `DSD|STAT` lines (it
   recognises the prefix); the host platform does not pad.
3. **Errors.** The core prints the `DSD|ERR` line, then calls `dsd_plat_fatal(const dsd_error *err)` (code, object,
   event, file, line, message; fixed-width fields), which draws the red box on the bottom screen and does not
   return; START restarts through item 1. Platform-side failures before or outside the VM use four codes that WS2
   adds to the R5xx catalog (messages in the C9 voice; WS2 may renumber, and WS3 follows):
   - **R580** NitroFS could not be mounted (`strerror(errno)` in the message);
   - **R581** `game.dsdb` missing, damaged, or built for a different runtime (the loader's ABI-mismatch words);
   - **R582** the soundbank could not be loaded (`mmInitDefault` false);
   - **R583** a sound could not be loaded (`mmLoadEffect` returned 1, bad id, or 2, load failed).
4. **Memory figures for `DSD|MEM`.** `void dsd_plat_mem(dsd_plat_mem_info *out)` fills the keys only the platform
   knows, as `uint32_t` used/total pairs: `heapfree`, `snd`, `objvram_top/bot`, `pal16_top/bot`, `pal256_top/bot`
   and `cstack` (the C-stack high-water mark from a painted stack; total = `VERSION` `cstack`). The core adds `inst`
   and `arena` and prints the line.

## Alternatives

- The platform owns the frame loop and calls `dsd_core_frame()`: splits boot and error handling across the seam and
  duplicates the loop in the host runner. Rejected.
- The platform splits LOG text: the host and DS writers could drift, and host traces must match emulator logs line
  for line (C8 "Host runner"). Rejected.
- WS3 prints platform errors with WS2's generic codes: none exist yet, and C9 forbids unlisted codes.

## Migration

None yet: C11 is not published. When WS2 publishes `dsd_platform.h` with these (or other) answers, WS3 deletes
`ds_boot_stub.c`, renames its codes if needed, and removes the markers.
