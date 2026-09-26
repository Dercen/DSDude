// SPDX-License-Identifier: CC0-1.0
//
// The C8 log writer. Every line goes through exactly one protocol (melonDS also executes the legacy signature, so
// using both would print each line twice there). Buffers are static, so they live in main RAM, never in DTCM.
// libnds nocashMessage() is not used: it writes 0x04FFFA14 (no newline, 120-character truncation).

#include <string.h>

#include <nds.h>

#include "dsd_log.h"

#define DSD_LINE_MAX 1023 // characters per line, '\n' included

extern void dsd_legacy_stub(void);
extern char dsd_legacy_text[1024];

static char dsd_raw_line[DSD_LINE_MAX + 1];
static char dsd_emulator_id[17];
static dsd_log_protocol dsd_protocol = DSD_LOG_LEGACY;

dsd_log_protocol dsd_log_init(void)
{
    for (int i = 0; i < 16; i++)
        dsd_emulator_id[i] = (char)REG_NOCASH_EMULATOR_ID[i];
    dsd_emulator_id[16] = '\0';

    // Keep only printable ASCII, so hardware open-bus bytes never reach the log.
    for (int i = 0; i < 16; i++)
    {
        char c = dsd_emulator_id[i];
        if (c < 0x20 || c > 0x7E)
        {
            dsd_emulator_id[i] = '\0';
            break;
        }
    }

    if (strncmp(dsd_emulator_id, "melonDS", 7) == 0 || strncmp(dsd_emulator_id, "no$gba", 6) == 0)
        dsd_protocol = DSD_LOG_RAW;
    else
        dsd_protocol = DSD_LOG_LEGACY;

    return dsd_protocol;
}

const char *dsd_log_emulator_id(void)
{
    return dsd_emulator_id;
}

static void dsd_emit(char *buf, size_t len)
{
    buf[len] = '\n';
    buf[len + 1] = '\0';

    if (dsd_protocol == DSD_LOG_RAW)
    {
        REG_NOCASH_STR_RAW = (u32)buf;
    }
    else
    {
        // The stub is code that was just written through the data cache: flush it and drop stale instructions.
        DC_FlushRange((const void *)dsd_legacy_stub, 1040);
        IC_InvalidateRange((const void *)dsd_legacy_stub, 1040);
        dsd_legacy_stub();
    }
}

static char *dsd_buffer(void)
{
    return dsd_protocol == DSD_LOG_RAW ? dsd_raw_line : dsd_legacy_text;
}

void dsd_log_line(const char *line)
{
    char *buf = dsd_buffer();
    size_t len = strnlen(line, DSD_LINE_MAX - 1);
    memcpy(buf, line, len);
    dsd_emit(buf, len);
}

void dsd_log_text(const char *prefix, const char *text)
{
    char *buf = dsd_buffer();
    size_t plen = strnlen(prefix, 64);
    size_t room = DSD_LINE_MAX - 1 - plen;

    do
    {
        memcpy(buf, prefix, plen);
        size_t len = plen;
        while (*text != '\0' && *text != '\n' && len - plen < room)
        {
            if (*text != '\r')
                buf[len++] = *text;
            text++;
        }
        dsd_emit(buf, len);
        if (*text == '\n')
            text++;
    } while (*text != '\0');
}

void dsd_log_pad(void)
{
    char *buf = dsd_buffer();
    memcpy(buf, "DSD|PAD|", 8);
    memset(buf + 8, '.', DSD_LINE_MAX - 1 - 8);
    for (int i = 0; i < 6; i++)
        dsd_emit(buf, DSD_LINE_MAX - 1);
}
