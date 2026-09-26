// SPDX-License-Identifier: Zlib
//
// Soundbank sizes for DSD|MEM `snd` (ds_snd.h). The table is read once at start-up with a few small reads.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ds_snd.h"

#define MSL_HEADER_BYTES 12
#define MAS_PREFIX_BYTES 8
#define MAS_HEADER_BYTES (12 + 32 + 32 + 200) // counts/flags, channel volumes, channel pans, orders
#define MAS_SAMPLE_MSL_ID 10                  // offset of msl_id in a module's sample info
#define MAX_MODULE_SAMPLES 64

typedef struct {
    uint32_t bytes;
    uint16_t nsamples;
    uint16_t *samples; // soundbank sample ids the module uses
} ds_snd_module;

static uint32_t *g_sample_bytes;
static uint16_t g_nsamples;
static ds_snd_module *g_modules;
static uint16_t g_nmodules;

static bool read_at(FILE *f, long at, void *buf, size_t n)
{
    return fseek(f, at, SEEK_SET) == 0 && fread(buf, 1, n, f) == n;
}

static uint32_t le32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static void clear(void)
{
    for (uint32_t m = 0; m < g_nmodules; m++)
        free(g_modules[m].samples);
    free(g_modules);
    free(g_sample_bytes);
    g_modules = NULL;
    g_sample_bytes = NULL;
    g_nsamples = g_nmodules = 0;
}

// A module's sample ids: MAS header counts, then u32 offsets (instruments, samples, patterns) from the MAS header.
static void index_module(FILE *f, long entry, ds_snd_module *m)
{
    uint8_t counts[4];
    long mas = entry + MAS_PREFIX_BYTES;
    if (!read_at(f, mas, counts, sizeof(counts)))
        return;
    uint32_t ninst = counts[1], nsamp = counts[2];
    if (nsamp == 0 || nsamp > MAX_MODULE_SAMPLES)
        return;
    uint8_t offs[4 * MAX_MODULE_SAMPLES];
    if (!read_at(f, mas + MAS_HEADER_BYTES + 4 * (long)ninst, offs, 4 * nsamp))
        return;
    m->samples = malloc(nsamp * sizeof(uint16_t));
    if (m->samples == NULL)
        return;
    for (uint32_t s = 0; s < nsamp; s++)
    {
        uint8_t id[2];
        if (read_at(f, mas + (long)le32(offs + 4 * s) + MAS_SAMPLE_MSL_ID, id, sizeof(id)))
            m->samples[m->nsamples++] = (uint16_t)(id[0] | (id[1] << 8));
    }
}

bool ds_snd_index(const char *path)
{
    clear();
    FILE *f = fopen(path, "rb");
    if (f == NULL)
        return false;
    uint8_t hdr[MSL_HEADER_BYTES];
    bool ok = read_at(f, 0, hdr, sizeof(hdr)) && memcmp(hdr + 4, "*maxmod*", 8) == 0;
    uint32_t ns = ok ? (uint32_t)(hdr[0] | (hdr[1] << 8)) : 0;
    uint32_t nm = ok ? (uint32_t)(hdr[2] | (hdr[3] << 8)) : 0;
    uint32_t *offs = ok ? malloc((ns + nm) * sizeof(uint32_t) + 1) : NULL;
    g_sample_bytes = ok ? calloc(ns + 1, sizeof(uint32_t)) : NULL;
    g_modules = ok ? calloc(nm + 1, sizeof(ds_snd_module)) : NULL;
    ok = ok && offs && g_sample_bytes && g_modules && read_at(f, MSL_HEADER_BYTES, offs, (ns + nm) * sizeof(uint32_t));
    if (ok)
    {
        g_nsamples = (uint16_t)ns;
        g_nmodules = (uint16_t)nm;
        for (uint32_t i = 0; i < ns + nm; i++)
        {
            uint8_t prefix[4];
            long entry = (long)le32((const uint8_t *)&offs[i]);
            if (!read_at(f, entry, prefix, sizeof(prefix)))
                continue;
            if (i < ns)
                g_sample_bytes[i] = le32(prefix);
            else
            {
                g_modules[i - ns].bytes = le32(prefix);
                index_module(f, entry, &g_modules[i - ns]);
            }
        }
    }
    free(offs);
    fclose(f);
    if (!ok)
        clear();
    return ok;
}

uint32_t ds_snd_sample_bytes(uint32_t sample_id)
{
    return sample_id < g_nsamples ? g_sample_bytes[sample_id] : 0;
}

uint32_t ds_snd_module_bytes(uint32_t module_id)
{
    return module_id < g_nmodules ? g_modules[module_id].bytes : 0;
}

uint32_t ds_snd_module_samples(uint32_t module_id, uint16_t *out, uint32_t cap)
{
    if (module_id >= g_nmodules)
        return 0;
    uint32_t n = 0;
    for (uint32_t s = 0; s < g_modules[module_id].nsamples && n < cap; s++)
        out[n++] = g_modules[module_id].samples[s];
    return n;
}

uint32_t ds_snd_resident(const uint16_t *effects, uint32_t neffects, const uint16_t *modules, uint32_t nmodules)
{
    // Distinct samples: a bitmap over the soundbank's sample ids.
    static uint8_t seen[(65536 + 7) / 8];
    memset(seen, 0, (g_nsamples + 7u) / 8u + 1u);
    uint32_t total = 0;
    for (uint32_t i = 0; i < neffects; i++)
    {
        uint32_t id = effects[i];
        if (id < g_nsamples && !(seen[id / 8] & (1u << (id % 8))))
        {
            seen[id / 8] |= (uint8_t)(1u << (id % 8));
            total += g_sample_bytes[id];
        }
    }
    for (uint32_t i = 0; i < nmodules; i++)
    {
        uint32_t m = modules[i];
        if (m >= g_nmodules)
            continue;
        total += g_modules[m].bytes;
        for (uint32_t s = 0; s < g_modules[m].nsamples; s++)
        {
            uint32_t id = g_modules[m].samples[s];
            if (id < g_nsamples && !(seen[id / 8] & (1u << (id % 8))))
            {
                seen[id / 8] |= (uint8_t)(1u << (id % 8));
                total += g_sample_bytes[id];
            }
        }
    }
    return total;
}
