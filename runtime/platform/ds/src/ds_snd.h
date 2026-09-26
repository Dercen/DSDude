// SPDX-License-Identifier: Zlib
//
// ds_snd.h: sizes from nitro:/soundbank.bin, for DSD|MEM's `snd` (resident sound data, C13 soundRamBytes). maxmod
// does not report what mmLoad/mmLoadEffect keep in RAM, so the platform reads the soundbank's own table:
//   header: u16 samples, u16 modules, u8[8] "*maxmod*"; then u32 offsets[samples + modules] from the file start;
//   each entry: u32 size, u8 type (2 sample, 0 module), u8 version (0x18), u16 reserved, then `size` bytes.
//   A module (MAS) lists its samples; each sample info carries the soundbank sample id (msl_id) at byte 10.
// mmLoad keeps a module and loads the samples it uses; a sample shared with an effect is resident once.

#ifndef DSD_DS_SND_H
#define DSD_DS_SND_H

#include <stdbool.h>
#include <stdint.h>

// Reads the soundbank's table. Returns false (and every size stays 0) when the file is missing or malformed.
bool ds_snd_index(const char *path);

// Bytes an effect's sample occupies (0 for an unknown id).
uint32_t ds_snd_sample_bytes(uint32_t sample_id);

// Bytes a module occupies, without its samples (0 for an unknown id).
uint32_t ds_snd_module_bytes(uint32_t module_id);

// The soundbank sample ids a module uses; returns how many were written (at most `cap`).
uint32_t ds_snd_module_samples(uint32_t module_id, uint16_t *out, uint32_t cap);

// Resident bytes for a set of loaded effects and modules: every distinct sample once, plus each module.
uint32_t ds_snd_resident(const uint16_t *effects, uint32_t neffects, const uint16_t *modules, uint32_t nmodules);

#endif // DSD_DS_SND_H
