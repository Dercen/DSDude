// SPDX-License-Identifier: Zlib
//
// The C8 log writer. Every line goes through exactly one protocol (melonDS also executes the legacy signature, so
// using both would print each line twice there). Buffers are static, so they live in main RAM, never in DTCM:
// both emulators read the text through the ARM9 bus, which does not map DTCM. libnds nocashMessage() is never
// used: it writes 0x04FFFA14 (no newline, 120-character truncation).

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include <nds.h>

#include "ds_log.h"

extern void dsd_legacy_stub(void);
extern char dsd_legacy_text[1024];

// Where lines are assembled before they are copied into the protocol's buffer.
static char ds_fmt_line[DSD_LOG_LINE_MAX + 1];
static char ds_raw_line[DSD_LOG_LINE_MAX + 1];
static char ds_emulator_id[17];
static ds_log_protocol ds_protocol = DSD_LOG_LEGACY;

ds_log_protocol ds_log_init(void)
{
    for (int i = 0; i < 16; i++)
        ds_emulator_id[i] = (char)REG_NOCASH_EMULATOR_ID[i];
    ds_emulator_id[16] = '\0';

    // Keep only printable ASCII, so hardware open-bus bytes never reach the log.
    for (int i = 0; i < 16; i++)
    {
        unsigned char c = (unsigned char)ds_emulator_id[i];
        if (c < 0x20 || c > 0x7E)
        {
            ds_emulator_id[i] = '\0';
            break;
        }
    }

    if (strncmp(ds_emulator_id, "melonDS", 7) == 0 || strncmp(ds_emulator_id, "no$gba", 6) == 0)
        ds_protocol = DSD_LOG_RAW;
    else
        ds_protocol = DSD_LOG_LEGACY;

    return ds_protocol;
}

const char *ds_log_emulator_id(void)
{
    return ds_emulator_id;
}

const char *ds_log_protocol_name(void)
{
    return ds_protocol == DSD_LOG_RAW ? "raw" : "legacy";
}

static char *ds_buffer(void)
{
    return ds_protocol == DSD_LOG_RAW ? ds_raw_line : dsd_legacy_text;
}

// buf[0..len) holds the line; len <= DSD_LOG_LINE_MAX - 1.
static void ds_emit(char *buf, size_t len)
{
    buf[len] = '\n';
    buf[len + 1] = '\0';

    if (ds_protocol == DSD_LOG_RAW)
    {
        // The emulator reads memory, not the cache.
        DC_FlushRange(buf, len + 2);
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

static bool ds_needs_pad(const char *line)
{
    return strncmp(line, "DSD|READY|", 10) == 0 || strncmp(line, "DSD|ERR|", 8) == 0 ||
           strncmp(line, "DSD|STAT|", 9) == 0;
}

void ds_log_pad(void)
{
    char *buf = ds_buffer();
    memcpy(buf, "DSD|PAD|", 8);
    memset(buf + 8, '.', DSD_LOG_LINE_MAX - 1 - 8);
    for (int i = 0; i < 6; i++)
        ds_emit(buf, DSD_LOG_LINE_MAX - 1);
}

void ds_log_line(const char *line)
{
    char *buf = ds_buffer();
    size_t len = strnlen(line, DSD_LOG_LINE_MAX - 1);
    if (line != buf)
        memmove(buf, line, len);
    ds_emit(buf, len);
    if (ds_needs_pad(buf))
        ds_log_pad();
}

void ds_log_write(const char *line, uint32_t len)
{
    while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r'))
        len--;
    if (len > DSD_LOG_LINE_MAX - 1)
        len = DSD_LOG_LINE_MAX - 1;
    char *buf = ds_buffer();
    memcpy(buf, line, len);
    ds_emit(buf, len);
}

void ds_log_linef(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(ds_fmt_line, sizeof(ds_fmt_line) - 1, fmt, ap);
    va_end(ap);
    ds_log_line(ds_fmt_line);
}

void ds_log_text(const char *prefix, const char *text)
{
    char *buf = ds_buffer();
    size_t plen = strnlen(prefix, 64);
    size_t room = DSD_LOG_LINE_MAX - 1 - plen;

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
        ds_emit(buf, len);
        if (*text == '\n')
            text++;
    } while (*text != '\0');
}
