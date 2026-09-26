// main.c: dsdude-host, the headless runner of the portable core (PLAN.md 2.4; contracts/log-protocol.md
// "Host runner"):
//
//     dsdude-host <nitrofs-dir | game.dsdb> [--frames N] [--input keys.txt] [--trace out.jsonl] [--png-dir dir]
//                 [--seed N]
//
// Prints the C8 DSD| lines on stdout (no pads). Exit status: 0 the game ended normally (DSD|EXIT) or ran its N
// frames, 1 a runtime error (DSD|ERR), 2 a usage or file error (message on stderr).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

#include "game.h"
#include "host.h"

#define EXIT_OK 0
#define EXIT_RUNTIME_ERROR 1
#define EXIT_USAGE 2
#define KEY_FILE_MAX (1024 * 1024) // largest --input file read
#define DECIMAL_BASE 10

static const char USAGE[] =
    "usage: dsdude-host <nitrofs-dir | game.dsdb> [--frames N] [--input keys.txt] [--trace out.jsonl]\n"
    "                   [--png-dir dir] [--seed N]\n";

// Large buffers live in static storage (the host keeps below 1 MB of stack, like the DS build's rules).
static HostKeyScript g_keys;
static char g_key_text[KEY_FILE_MAX];

// Command-line options.
typedef struct Options {
    const char *root;
    uint32_t frames;
    const char *input;
    const char *trace;
    const char *png_dir;
    uint32_t seed;
} Options;

// Parses a non-negative decimal that fits uint32; false otherwise.
static bool parse_u32(const char *s, uint32_t *out) {
    char *end;
    if (*s < '0' || *s > '9') return false;
    unsigned long long v = strtoull(s, &end, DECIMAL_BASE);
    if (*end != '\0' || v > UINT32_MAX) return false;
    *out = (uint32_t)v;
    return true;
}

// Fills *o from argv; prints the problem and returns false on a usage error.
static bool parse_args(int argc, char **argv, Options *o) {
    memset(o, 0, sizeof *o);
    for (int i = 1; i < argc; i++) {
        const char *a = argv[i];
        const char *v = i + 1 < argc ? argv[i + 1] : NULL;
        if (strncmp(a, "--", 2) != 0) {
            if (o->root != NULL) {
                fprintf(stderr, "dsdude-host: more than one game given (%s)\n", a);
                return false;
            }
            o->root = a;
            continue;
        }
        if (v == NULL) {
            fprintf(stderr, "dsdude-host: %s needs a value\n", a);
            return false;
        }
        bool ok = true;
        if (strcmp(a, "--frames") == 0) ok = parse_u32(v, &o->frames);
        else if (strcmp(a, "--seed") == 0) ok = parse_u32(v, &o->seed);
        else if (strcmp(a, "--input") == 0) o->input = v;
        else if (strcmp(a, "--trace") == 0) o->trace = v;
        else if (strcmp(a, "--png-dir") == 0) o->png_dir = v;
        else {
            fprintf(stderr, "dsdude-host: unknown option %s\n", a);
            return false;
        }
        if (!ok) {
            fprintf(stderr, "dsdude-host: %s needs a whole number, got %s\n", a, v);
            return false;
        }
        i++;
    }
    if (o->root == NULL) fprintf(stderr, "dsdude-host: no game given\n");
    return o->root != NULL;
}

// Reads and parses the --input key script into g_keys; prints the problem and returns false on failure.
static bool load_keys(const char *path) {
    FILE *f = fopen(path, "rb");
    if (f == NULL) {
        fprintf(stderr, "dsdude-host: can't open %s\n", path);
        return false;
    }
    size_t n = fread(g_key_text, 1, sizeof g_key_text, f);
    bool too_big = n == sizeof g_key_text;
    fclose(f);
    if (too_big) {
        fprintf(stderr, "dsdude-host: %s is too large\n", path);
        return false;
    }
    char err[HOST_KEY_ERR_MAX];
    if (!host_keys_parse(&g_keys, g_key_text, (uint32_t)n, err, sizeof err)) {
        fprintf(stderr, "dsdude-host: %s: %s\n", path, err);
        return false;
    }
    return true;
}

int main(int argc, char **argv) {
#ifdef _WIN32
    // LF-only output on Windows too, so host logs compare byte for byte across compilers.
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    Options o;
    if (!parse_args(argc, argv, &o)) {
        fputs(USAGE, stderr);
        return EXIT_USAGE;
    }
    if (o.input != NULL && !load_keys(o.input)) return EXIT_USAGE;
    // The trace is one JSON object per frame; program-form games run no frames and leave it empty.
    FILE *trace = NULL;
    if (o.trace != NULL && (trace = fopen(o.trace, "wb")) == NULL) {
        fprintf(stderr, "dsdude-host: can't write %s\n", o.trace);
        return EXIT_USAGE;
    }
    HostConfig cfg = {o.root, o.seed, o.input != NULL ? &g_keys : NULL, NULL, NULL};
    host_configure(&cfg);
    int32_t st = dsd_game_boot();
    for (uint32_t f = 0; st == DSD_GAME_RUNNING && f < o.frames; f++) st = dsd_game_frame();
    if (trace != NULL) fclose(trace);
    fflush(stdout);
    return st == DSD_GAME_FAILED ? EXIT_RUNTIME_ERROR : EXIT_OK;
}
