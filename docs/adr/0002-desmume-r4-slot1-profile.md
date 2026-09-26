# ADR-0002: DeSmuME's R4 slot-1 profile does not mount NitroFS

- Status: **proposed** (WS1, 2026-09-25). WS0 numbers, merges and closes it (renumber if 0002 is taken).
- Affected streams: WS1/WS8 (EmulatorManager's DeSmuME profile), WS3 (runtime boot path), WS6 (emulator settings).
- Sources: PLAN.md section 7.1 spike 9, `docs/research/verification.md` claim 3, `docs/status/ws1.md` spike 9.

## Context

Spike 9 asks for `samples/hello` to boot in DeSmuME with default settings and with `--slot1 R4 --slot1-fat-dir`.
With default settings (slot 1 auto-selects "Retail MC+ROM") `nitroFSInit(NULL)` succeeds and `DSD|LOG|hello` is
captured. With `--slot1 R4 --slot1-fat-dir <dir>` DeSmuME 0.9.13 prints `slot1 fat not successfully mounted` twice,
for an empty folder and for the folder that holds the ROM alike, and the ROM logs
`DSD|LOG|hello: nitroFSInit failed`. libnds then has no DLDI device and no argv, and the card commands reach the R4
device instead of the ROM, so NitroFS cannot mount.

## Decision (recommended)

DSDude launches DeSmuME only with its default slot-1 device: `DeSmuME_0.9.13_x64.exe <rom>`, no `--slot1` flags.
The R4/FAT profile is not offered in the IDE's emulator settings, and EmulatorManager never passes `--slot1`. The
runtime needs no change: NitroFS through card commands is the path both emulators and py-desmume use.

## Consequences

- Nothing in the Play pipeline changes; spike 9 passes for the supported profiles (melonDS, DeSmuME default,
  py-desmume).
- Testing a flashcart-style (DLDI/argv) boot waits for real hardware (spike 15), not DeSmuME.

## Alternatives

- Build a FAT image with the ROM and pass argv through DeSmuME: DeSmuME 0.9.13 has no argv option, so it would still
  depend on its R4 FAT emulation mounting, which failed here.
