// SPDX-License-Identifier: Zlib
//
// ds_sys.h: which machine the ROM runs on, for results read off the screen (hardware runs have no stdout). A DSi or
// 3DS loader such as TWiLight Menu++ may start a ROM in DSi mode (16 MB, SCFG), where the ARM9 can also run at
// 134 MHz; the M1 figures assume a DS (67 MHz).

#ifndef DSD_DS_SYS_H
#define DSD_DS_SYS_H

#include <stdbool.h>
#include <stdint.h>

// True in DSi mode (libnds isDSiMode).
bool ds_sys_dsi_mode(void);

// The ARM9 clock in MHz: 67, or 134 in DSi mode with SCFG_CLK bit 0 set.
uint32_t ds_sys_arm9_mhz(void);

// Forces the ARM9 to 67 MHz in DSi mode (no effect in DS mode); returns the clock it had, in MHz.
uint32_t ds_sys_force_67mhz(void);

// "DS mode, ARM9 67 MHz" or "DSi mode, ARM9 134 MHz".
const char *ds_sys_describe(void);

#endif // DSD_DS_SYS_H
