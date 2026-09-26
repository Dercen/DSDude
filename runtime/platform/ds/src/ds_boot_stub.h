// SPDX-License-Identifier: Zlib
//
// ds_boot_stub.h: a stand-in for the core's boot until WS2's loader and VM land (ADR-pending ADR-0004).

#ifndef DSD_DS_BOOT_STUB_H
#define DSD_DS_BOOT_STUB_H

// Reads nitro:/game.dsdb, checks the C2 header (magic, major 0, ABI hash) and prints DSD|READY.
void ds_boot_stub_run(void);

#endif // DSD_DS_BOOT_STUB_H
