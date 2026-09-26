// test.h: the host test runner's minimal assertion kit (runtime/tests/). Host-only: printf is fine here, never in
// runtime/core. Each suite is a `void suite(void)` listed in test_main.c; a failed check prints file:line and the
// values, and the runner exits 1 if any check failed.
#ifndef DSD_TEST_H
#define DSD_TEST_H

#include <stdint.h>

// Records one check; prints the failure (with the two values when given) and counts it. Returns ok.
int dsd_test_check(int ok, const char *file, int line, const char *expr);
int dsd_test_check_i64(int64_t got, int64_t want, const char *file, int line, const char *expr);
int dsd_test_check_str(const char *got, const char *want, const char *file, int line, const char *expr);

// Reads a whole file (path relative to the repo root, where make runs the tests) into buf; returns its size, or -1
// when it cannot be read or does not fit.
int32_t dsd_test_read_file(const char *path, char *buf, uint32_t cap);

// Goldens do not depend on the ABI hash (any T1 append to contracts/builtins.json changes it): this overwrites the
// hash field of every "DSD|READY|<version>|<hash>" line in `text` with DSD_TEST_ABI_MASK, in place. Comparisons
// mask both the captured output and the golden.
#define DSD_TEST_ABI_MASK 'x'
void dsd_test_mask_abi(char *text);
// The READY line this build prints ("DSD|READY|<version>|<hash>\n", from game.h and runtime/gen), for literal
// expectations.
const char *dsd_test_ready_line(void);

// Deterministic test PRNG (xorshift32, never seeded with 0); the core's own RNG is tested separately.
uint32_t dsd_test_rand(void);
void dsd_test_seed(uint32_t seed);

#define CHECK(cond) dsd_test_check((cond) ? 1 : 0, __FILE__, __LINE__, #cond)
#define CHECK_EQ(got, want) dsd_test_check_i64((int64_t)(got), (int64_t)(want), __FILE__, __LINE__, #got " == " #want)
#define CHECK_STR(got, want) dsd_test_check_str((got), (want), __FILE__, __LINE__, #got " == " #want)

// Every suite, defined in its runtime/tests/test_*.c file.
void suite_fixed(void);
void suite_heap(void);
void suite_host(void);
void suite_loader(void);
void suite_number(void);
void suite_numfmt(void);
void suite_programs(void);
void suite_trig(void);

#endif // DSD_TEST_H
