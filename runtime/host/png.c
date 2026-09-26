// png.c: the host runner's PNG output for --png-dir (contracts/log-protocol.md "Screens"). A minimal writer with no
// library: 8-bit RGB (colour type 2), filter 0 on every row, and a zlib stream of stored (uncompressed) deflate
// blocks, so the bytes depend only on the pixels. Screens are 256x192, ~148 KB per file.
#include <errno.h>
#include <string.h>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>
#endif

#include "host.h"

#define PNG_SIGNATURE_BYTES 8
#define CHANNELS 3                    // R, G, B
#define FILTER_NONE 0                 // the per-row filter byte
#define IHDR_BYTES 13
#define BIT_DEPTH 8
#define COLOUR_TYPE_RGB 2
#define ZLIB_CMF 0x78u                // deflate, 32 KB window
#define ZLIB_FLG 0x01u                // no preset dictionary, fastest level; (CMF * 256 + FLG) % 31 == 0
#define STORED_BLOCK_MAX 65535u       // largest stored deflate block
#define STORED_FINAL 1u               // BFINAL = 1, BTYPE = 00 (stored)
#define STORED_MORE 0u
#define ADLER_MOD 65521u
#define CRC_POLY 0xEDB88320u          // CRC-32 (IEEE), reflected
#define CRC_TABLE_SIZE 256
#define CRC_INIT 0xFFFFFFFFu          // CRC-32 starts at all ones and is inverted at the end
#define BYTE_MASK 0xFFu
#define BYTE_BITS 8
#define RGB555_CHANNEL_BITS 5
#define RGB555_CHANNEL_MASK 0x1Fu
#define EXPAND_SHIFT 3                // c8 = c5 << 3 | c5 >> 2 (the top bits repeat into the low ones)
#define EXPAND_LOW_SHIFT 2
#define ROW_MAX (1 + DSD_SCREEN_W * CHANNELS) // filter byte + pixels, for the screens this writer serves
#define DIR_MODE 0777                 // new directories: permissions come from the umask

static uint32_t g_crc_table[CRC_TABLE_SIZE];

static void crc_init(void) {
    for (uint32_t n = 0; n < CRC_TABLE_SIZE; n++) {
        uint32_t c = n;
        for (int k = 0; k < BYTE_BITS; k++) c = (c & 1u) ? CRC_POLY ^ (c >> 1) : c >> 1;
        g_crc_table[n] = c;
    }
}

static uint32_t crc_update(uint32_t crc, const uint8_t *p, size_t n) {
    for (size_t i = 0; i < n; i++) crc = g_crc_table[(crc ^ p[i]) & BYTE_MASK] ^ (crc >> BYTE_BITS);
    return crc;
}

// Big-endian 32-bit store (PNG's byte order).
static void be32(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v >> 24);
    p[1] = (uint8_t)(v >> 16);
    p[2] = (uint8_t)(v >> 8);
    p[3] = (uint8_t)v;
}

// A chunk being written: its CRC covers the type and the data, so both pass through chunk_data.
typedef struct Chunk {
    FILE *f;
    uint32_t crc;
    bool ok;
} Chunk;

static void chunk_data(Chunk *c, const void *p, size_t n) {
    c->crc = crc_update(c->crc, p, n);
    c->ok = c->ok && fwrite(p, 1, n, c->f) == n;
}

static void chunk_begin(Chunk *c, FILE *f, const char *type, uint32_t length) {
    uint8_t len[4];
    be32(len, length);
    c->f = f;
    c->crc = CRC_INIT;
    c->ok = fwrite(len, 1, sizeof len, f) == sizeof len;
    chunk_data(c, type, 4);
}

static bool chunk_end(Chunk *c) {
    uint8_t crc[4];
    be32(crc, c->crc ^ CRC_INIT);
    return c->ok && fwrite(crc, 1, sizeof crc, c->f) == sizeof crc;
}

// One image row as PNG bytes: the filter byte, then R, G, B per pixel.
static void encode_row(const uint16_t *src, uint32_t width, uint8_t *row) {
    row[0] = FILTER_NONE;
    for (uint32_t x = 0; x < width; x++) {
        for (uint32_t ch = 0; ch < CHANNELS; ch++) {
            uint32_t c5 = (src[x] >> (ch * RGB555_CHANNEL_BITS)) & RGB555_CHANNEL_MASK; // R is bits 0-4
            row[1 + x * CHANNELS + ch] = (uint8_t)((c5 << EXPAND_SHIFT) | (c5 >> EXPAND_LOW_SHIFT));
        }
    }
}

bool host_png_write(const char *path, const uint16_t *pixels, uint32_t width, uint32_t height) {
    static const uint8_t SIGNATURE[PNG_SIGNATURE_BYTES] = {0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
    uint32_t row_bytes = 1 + width * CHANNELS;
    if (row_bytes > ROW_MAX) return false;
    crc_init();
    FILE *f = fopen(path, "wb");
    if (f == NULL) return false;
    bool ok = fwrite(SIGNATURE, 1, sizeof SIGNATURE, f) == sizeof SIGNATURE;

    uint8_t ihdr[IHDR_BYTES] = {0};
    be32(ihdr, width);
    be32(ihdr + 4, height);
    ihdr[8] = BIT_DEPTH;
    ihdr[9] = COLOUR_TYPE_RGB; // compression, filter and interlace methods stay 0
    Chunk c;
    chunk_begin(&c, f, "IHDR", IHDR_BYTES);
    chunk_data(&c, ihdr, sizeof ihdr);
    ok = chunk_end(&c) && ok;

    // IDAT: zlib header, stored blocks of at most 65,535 bytes (each: final flag, LEN, NLEN), Adler-32.
    uint32_t raw = row_bytes * height;
    uint32_t blocks = raw == 0 ? 1 : (raw + STORED_BLOCK_MAX - 1) / STORED_BLOCK_MAX;
    uint32_t block_header = 5; // BFINAL/BTYPE byte + LEN + NLEN
    chunk_begin(&c, f, "IDAT", 2 + raw + blocks * block_header + 4);
    const uint8_t zhead[2] = {ZLIB_CMF, ZLIB_FLG};
    chunk_data(&c, zhead, sizeof zhead);
    uint32_t a = 1;
    uint32_t b = 0;
    uint8_t row[ROW_MAX];
    uint32_t row_at = row_bytes; // bytes of `row` already written (row_bytes: fetch the next row)
    uint32_t y = 0;
    for (uint32_t left = raw, blk = 0; blk < blocks; blk++) {
        uint32_t n = left < STORED_BLOCK_MAX ? left : STORED_BLOCK_MAX;
        uint8_t head[5] = {blk + 1 == blocks ? STORED_FINAL : STORED_MORE, (uint8_t)n, (uint8_t)(n >> 8),
                           (uint8_t)~n, (uint8_t)(~n >> 8)};
        chunk_data(&c, head, sizeof head);
        for (uint32_t done = 0; done < n;) {
            if (row_at == row_bytes) {
                encode_row(pixels + (size_t)y++ * width, width, row);
                row_at = 0;
            }
            uint32_t take = row_bytes - row_at < n - done ? row_bytes - row_at : n - done;
            chunk_data(&c, row + row_at, take);
            for (uint32_t i = 0; i < take; i++) {
                a = (a + row[row_at + i]) % ADLER_MOD;
                b = (b + a) % ADLER_MOD;
            }
            row_at += take;
            done += take;
        }
        left -= n;
    }
    uint8_t adler[4];
    be32(adler, (b << 16) | a);
    chunk_data(&c, adler, sizeof adler);
    ok = chunk_end(&c) && ok;

    chunk_begin(&c, f, "IEND", 0);
    ok = chunk_end(&c) && ok;
    return fclose(f) == 0 && ok;
}

// Creates directory `dir` unless it exists.
static bool make_dir(const char *dir) {
#ifdef _WIN32
    int rc = _mkdir(dir);
#else
    int rc = mkdir(dir, DIR_MODE);
#endif
    return rc == 0 || errno == EEXIST;
}

bool host_png_screens(const char *dir) {
    static const char *const NAMES[DSD_SCREEN_COUNT] = {"top.png", "bottom.png"};
    static HostScreen screen;
    if (!make_dir(dir)) return false;
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) {
        char path[HOST_PATH_MAX];
        snprintf(path, sizeof path, "%s/%s", dir, NAMES[s]);
        host_render_screen(s, screen);
        if (!host_png_write(path, &screen[0][0], DSD_SCREEN_W, DSD_SCREEN_H)) return false;
    }
    return true;
}
