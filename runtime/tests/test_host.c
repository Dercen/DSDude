// test_host.c: host-runner pieces: the C8 line formatter (dsd_log_*), the --input key-script parser, and the C13
// values compiled into dsd_limits.h against contracts/runtime-limits.json.
#include <stdio.h>
#include <string.h>

#include "dsd_limits.h"
#include "dsd_log.h"
#include "dsd_random.h"
#include "host.h"
#include "test.h"

#define CAP_EXIT_READY 96 // "DSD|EXIT|0\n" plus a READY line

#define CAPTURE_MAX 8192
#define LIMITS_JSON "contracts/runtime-limits.json"
#define LIMITS_MAX 8192
#define LONG_TEXT 2000          // longer than one LOG line
#define LOG_TEXT_PER_LINE 1014  // 1023 bytes - "DSD|LOG|" (8) - '\n' (1)

static char g_cap[CAPTURE_MAX];
static uint32_t g_cap_len;

static void capture(const char *line, uint32_t len, void *ctx) {
    (void)ctx;
    if (g_cap_len + len >= CAPTURE_MAX) return;
    memcpy(g_cap + g_cap_len, line, len);
    g_cap_len += len;
    g_cap[g_cap_len] = '\0';
}

static void capture_reset(void) {
    g_cap_len = 0;
    g_cap[0] = '\0';
    HostConfig cfg = {"unused", 1, NULL, capture, NULL};
    host_configure(&cfg);
}

static void test_log_lines(void) {
    capture_reset();
    dsd_log_text("a\r\nb", 4);
    CHECK_STR(g_cap, "DSD|LOG|a\nDSD|LOG|b\n");

    capture_reset();
    dsd_log_text("", 0);
    CHECK_STR(g_cap, "DSD|LOG|\n");

    // Long text continues on further LOG lines of at most 1023 bytes each.
    static char text[LONG_TEXT];
    memset(text, 'x', sizeof text);
    capture_reset();
    dsd_log_text(text, LONG_TEXT);
    const char *second = strchr(g_cap, '\n') + 1;
    CHECK_EQ(second - g_cap, 8 + LOG_TEXT_PER_LINE + 1);
    CHECK_EQ(strlen(second), 8 + (LONG_TEXT - LOG_TEXT_PER_LINE) + 1);

    // A UTF-8 character never splits: with one byte left, a 2-byte 'é' moves to the next line.
    memset(text, 'x', LOG_TEXT_PER_LINE - 1);
    memcpy(text + LOG_TEXT_PER_LINE - 1, "\xC3\xA9", 2);
    capture_reset();
    dsd_log_text(text, LOG_TEXT_PER_LINE + 1);
    second = strchr(g_cap, '\n') + 1;
    CHECK_STR(second, "DSD|LOG|\xC3\xA9\n");

    // ERR: '|' in the fields becomes '/', the message keeps it, a newline in the message continues on LOG lines.
    capture_reset();
    dsd_fatal f = {"R530", "obj|a", "Step", "objects/obj_a/step.dss", 3, "one | two\nthree"};
    dsd_log_error(&f);
    CHECK_STR(g_cap, "DSD|ERR|R530|obj/a|Step|objects/obj_a/step.dss|3|one | two\nDSD|LOG|three\n");

    capture_reset();
    dsd_log_exit(0);
    dsd_log_ready();
    char want[CAP_EXIT_READY];
    snprintf(want, sizeof want, "DSD|EXIT|0\n%s", dsd_test_ready_line());
    CHECK_STR(g_cap, want);
}

// Checks one parsed input: held mask and touch.
static void input_is(const dsd_input *in, uint32_t held, int32_t touching, int32_t x, int32_t y, int line) {
    dsd_test_check_i64(in->held, held, __FILE__, line, "held");
    dsd_test_check_i64(in->touching, touching, __FILE__, line, "touching");
    if (touching) {
        dsd_test_check_i64(in->touch_x, x, __FILE__, line, "touch_x");
        dsd_test_check_i64(in->touch_y, y, __FILE__, line, "touch_y");
    }
}

static void test_keys(void) {
    static HostKeyScript ks;
    char err[HOST_KEY_ERR_MAX];
    const char *script = "# flap twice\r\n0 -\r\n30 a\n32 a+right\n\n  40   T128,96  \n41 b+T0,191\n50 -\n";
    CHECK(host_keys_parse(&ks, script, (uint32_t)strlen(script), err, sizeof err));
    CHECK_EQ(ks.count, 6);
    dsd_input in;
    host_keys_state(&ks, 29, &in);
    input_is(&in, 0, 0, 0, 0, __LINE__);
    host_keys_state(&ks, 30, &in);
    input_is(&in, 1u << DSD_BTN_A, 0, 0, 0, __LINE__);
    host_keys_state(&ks, 35, &in);
    input_is(&in, (1u << DSD_BTN_A) | (1u << DSD_BTN_RIGHT), 0, 0, 0, __LINE__);
    host_keys_state(&ks, 40, &in);
    input_is(&in, 0, 1, 128, 96, __LINE__);
    host_keys_state(&ks, 41, &in);
    input_is(&in, 1u << DSD_BTN_B, 1, 0, 191, __LINE__);
    host_keys_state(&ks, 1000, &in);
    input_is(&in, 0, 0, 0, 0, __LINE__);
    host_keys_state(NULL, 5, &in); // no script: nothing held
    input_is(&in, 0, 0, 0, 0, __LINE__);

    // Every key name.
    CHECK(host_keys_spec("a+b+x+y+l+r+start+select+up+down+left+right", 43, &in));
    CHECK_EQ(in.held, (1u << DSD_BTN_COUNT) - 1);

    // Errors carry the line number.
    static const char *const bad[] = {
        "5 a\n5 b\n",      // frames must increase
        "0 jump\n",        // unknown key
        "0 a++b\n",        // empty part
        "0 a+\n",          // trailing '+'
        "0 T256,0\n",      // x past the screen
        "0 T1,192\n",      // y past the screen
        "0 T1,2+T3,4\n",   // two touches
        "x a\n",           // no frame number
        "7\n",             // no keys
    };
    for (size_t i = 0; i < sizeof bad / sizeof bad[0]; i++) {
        if (!CHECK(!host_keys_parse(&ks, bad[i], (uint32_t)strlen(bad[i]), err, sizeof err))) continue;
        CHECK(strncmp(err, "line ", 5) == 0);
    }
    CHECK(!host_keys_parse(&ks, "0 -\n\n9 q\n", 9, err, sizeof err));
    CHECK_STR(err, "line 3: keys must be '-' or names like a+right, with T<x>,<y> for touch");
}

// One C13 key and the value dsd_limits.h compiles in.
typedef struct LimitRow {
    const char *key;
    int64_t value;
} LimitRow;

static void test_limits(void) {
    static const LimitRow rows[] = {
        {"instancesMax", DSD_C13_INSTANCES_MAX},
        {"instanceBlockBytes", DSD_C13_INSTANCE_BLOCK_BYTES},
        {"userSlotsPerObject", DSD_C13_USER_SLOTS_PER_OBJECT},
        {"roomArenaBytes", DSD_C13_ROOM_ARENA_BYTES},
        {"stringArenaBytes", DSD_C13_STRING_ARENA_BYTES},
        {"dsdbMaxBytes", DSD_C13_DSDB_MAX_BYTES},
        {"alarms", DSD_C13_ALARMS},
        {"registersPerFrame", DSD_C13_REGISTERS_PER_FRAME},
        {"spritesPerScreen", DSD_C13_SPRITES_PER_SCREEN},
        {"affinePerScreen", DSD_C13_AFFINE_PER_SCREEN},
        {"predecodeBytes", DSD_C13_PREDECODE_BYTES},
    };
    static char json[LIMITS_MAX];
    int32_t n = dsd_test_read_file(LIMITS_JSON, json, LIMITS_MAX - 1);
    if (!CHECK(n > 0)) return;
    json[n] = '\0';
    for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
        char want[96];
        snprintf(want, sizeof want, "\"%s\": %lld,", rows[i].key, (long long)rows[i].value);
        char want_last[96]; // the last key has no comma
        snprintf(want_last, sizeof want_last, "\"%s\": %lld\n", rows[i].key, (long long)rows[i].value);
        dsd_test_check(strstr(json, want) != NULL || strstr(json, want_last) != NULL, __FILE__, __LINE__, rows[i].key);
    }
}

// The core's xorshift32: the reference sequence from seed 1, the zero-seed substitute, and bounded draws.
static void test_rng(void) {
    dsd_rng_seed(1);
    CHECK_EQ(dsd_rng_next(), 270369u);    // 1 ^ 1<<13 = 8193; ^ >>17 = 8193; ^ <<5 = 270369
    CHECK_EQ(dsd_rng_next(), 67634689u);
    dsd_rng_seed(0);
    CHECK_EQ(dsd_rng_state(), DSD_RNG_ZERO_SEED);
    CHECK_EQ(dsd_rng_below(0), 0);
    for (int32_t i = 0; i < 1000; i++) {
        if (!CHECK(dsd_rng_below(7) < 7)) break;
    }
}

void suite_host(void) {
    test_rng();
    test_log_lines();
    test_keys();
    test_limits();
}
