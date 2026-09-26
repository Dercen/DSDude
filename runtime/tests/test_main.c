// test_main.c: the host unit-test runner (`make -f runtime/Makefile.host test` builds and runs it twice: -O2 and the
// UBSan trap variant). Exit status 0 = every check passed, 1 = at least one failed; a UBSan trap kills the process
// with SIGILL (Linux) or 0xC000001D (Windows), which make also reports as a failure.
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <ctype.h>
#include <string.h>

#include "builtins_table.h"
#include "game.h"
#include "test.h"

// Seed for dsd_test_rand when a suite does not pick its own (any non-zero value; fixed so runs are reproducible).
#define TEST_DEFAULT_SEED 0x2545F491u

static int32_t g_checks;   // checks run
static int32_t g_failures; // checks failed
static uint32_t g_rng = TEST_DEFAULT_SEED;

int dsd_test_check(int ok, const char *file, int line, const char *expr) {
    g_checks++;
    if (!ok) {
        g_failures++;
        printf("FAIL %s:%d: %s\n", file, line, expr);
    }
    return ok;
}

int dsd_test_check_i64(int64_t got, int64_t want, const char *file, int line, const char *expr) {
    g_checks++;
    if (got != want) {
        g_failures++;
        printf("FAIL %s:%d: %s (got %lld, want %lld)\n", file, line, expr, (long long)got, (long long)want);
        return 0;
    }
    return 1;
}

int dsd_test_check_str(const char *got, const char *want, const char *file, int line, const char *expr) {
    g_checks++;
    if (strcmp(got, want) != 0) {
        g_failures++;
        printf("FAIL %s:%d: %s (got \"%s\", want \"%s\")\n", file, line, expr, got, want);
        return 0;
    }
    return 1;
}

#define READY_PREFIX "DSD|READY|"
#define ABI_HEX_DIGITS 8 // the hash prints as 8 lower-case hex digits
#define READY_LINE_MAX 64

void dsd_test_mask_abi(char *text) {
    size_t prefix = strlen(READY_PREFIX);
    for (char *line = text; line != NULL; line = strchr(line, '\n') != NULL ? strchr(line, '\n') + 1 : NULL) {
        if (strncmp(line, READY_PREFIX, prefix) != 0) continue;
        char *p = strchr(line + prefix, '|'); // the bar after the version field
        if (p == NULL) continue;
        p++;
        for (int k = 0; k < ABI_HEX_DIGITS && isxdigit((unsigned char)*p); k++) *p++ = DSD_TEST_ABI_MASK;
    }
}

const char *dsd_test_ready_line(void) {
    static char line[READY_LINE_MAX];
    snprintf(line, sizeof line, "%s%s|%08x\n", READY_PREFIX, DSD_RUNTIME_VERSION, (unsigned)DSD_ABI_HASH);
    return line;
}

int32_t dsd_test_read_file(const char *path, char *buf, uint32_t cap) {
    FILE *f = fopen(path, "rb");
    if (f == NULL) return -1;
    size_t n = fread(buf, 1, cap, f);
    bool whole = feof(f) != 0 || fgetc(f) == EOF;
    fclose(f);
    return whole ? (int32_t)n : -1;
}

uint32_t dsd_test_rand(void) {
    // xorshift32 (Marsaglia), shifts 13/17/5.
    g_rng ^= g_rng << 13;
    g_rng ^= g_rng >> 17;
    g_rng ^= g_rng << 5;
    return g_rng;
}

void dsd_test_seed(uint32_t seed) { g_rng = seed != 0 ? seed : TEST_DEFAULT_SEED; }

// One row per suite: its name (printed) and its entry point.
typedef struct Suite {
    const char *name;
    void (*run)(void);
} Suite;

static const Suite SUITES[] = {
    {"fixed", suite_fixed},
    {"number", suite_number},
    {"numfmt", suite_numfmt},
    {"trig", suite_trig},
    {"heap", suite_heap},
    {"loader", suite_loader},
    {"host", suite_host},
    {"programs", suite_programs},
};

int main(void) {
    for (size_t i = 0; i < sizeof SUITES / sizeof SUITES[0]; i++) {
        int32_t before = g_failures;
        dsd_test_seed(TEST_DEFAULT_SEED); // each suite sees the same random stream whatever runs before it
        SUITES[i].run();
        printf("%-8s %s\n", SUITES[i].name, g_failures == before ? "ok" : "FAILED");
    }
    printf("%d checks, %d failed\n", (int)g_checks, (int)g_failures);
    return g_failures == 0 ? 0 : 1;
}
