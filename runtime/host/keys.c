// keys.c: the --input key-script format (contracts/log-protocol.md "Host runner"):
//
//     # comment
//     0 -
//     30 a
//     32 a+right
//     40 T128,96
//     41 -
//
// One line per change: `<frame> <spec>`, frames strictly increasing, the spec holding until the next line. A spec
// is `-` (nothing) or `+`-joined key names (the btn_* names without `btn_`) and at most one touch `T<x>,<y>`
// (bottom-screen pixels). Blank lines and `#` comments are ignored; CRLF is accepted. WS1's `dsdude screenshot
// --keys` reads the same format.
#include <stdio.h>
#include <string.h>

#include "host.h"

// Key names, indexed by btn_* value (DSD_BTN_*).
static const char *const KEY_NAMES[DSD_BTN_COUNT] = {
    "a", "b", "x", "y", "l", "r", "start", "select", "up", "down", "left", "right",
};

#define DECIMAL_BASE 10
#define TOUCH_X_MAX (DSD_SCREEN_W - 1) // touch coordinates are bottom-screen pixels
#define TOUCH_Y_MAX (DSD_SCREEN_H - 1)

// Parses an unsigned decimal at s[*i..end); false when there is no digit or it exceeds `max`.
static bool parse_uint(const char *s, uint32_t *i, uint32_t end, uint32_t max, uint32_t *out) {
    uint32_t v = 0;
    uint32_t start = *i;
    while (*i < end && s[*i] >= '0' && s[*i] <= '9') {
        v = v * DECIMAL_BASE + (uint32_t)(s[*i] - '0');
        if (v > max) return false;
        (*i)++;
    }
    *out = v;
    return *i > start;
}

bool host_keys_spec(const char *spec, uint32_t len, dsd_input *out) {
    memset(out, 0, sizeof *out);
    if (len == 1 && spec[0] == '-') return true;
    uint32_t i = 0;
    while (i < len) {
        uint32_t end = i;
        while (end < len && spec[end] != '+') end++;
        if (end == i) return false; // empty part ("a++b", leading or trailing '+')
        if (spec[i] == 'T') {
            uint32_t j = i + 1;
            uint32_t x;
            uint32_t y;
            if (out->touching || !parse_uint(spec, &j, end, TOUCH_X_MAX, &x) || j >= end || spec[j++] != ',' ||
                !parse_uint(spec, &j, end, TOUCH_Y_MAX, &y) || j != end) {
                return false;
            }
            out->touching = 1;
            out->touch_x = (int32_t)x;
            out->touch_y = (int32_t)y;
        } else {
            uint32_t k = 0;
            while (k < DSD_BTN_COUNT && !(strlen(KEY_NAMES[k]) == end - i && memcmp(KEY_NAMES[k], spec + i, end - i) == 0)) {
                k++;
            }
            if (k == DSD_BTN_COUNT) return false;
            out->held |= 1u << k;
        }
        i = end + 1;
        if (end + 1 == len && spec[end] == '+') return false;
    }
    return true;
}

// Writes "line N: what" into err.
static bool parse_error(char *err, uint32_t cap, uint32_t line, const char *what) {
    snprintf(err, cap, "line %u: %s", (unsigned)line, what);
    return false;
}

bool host_keys_parse(HostKeyScript *ks, const char *text, uint32_t len, char *err, uint32_t err_cap) {
    ks->count = 0;
    uint32_t line = 0;
    uint32_t i = 0;
    while (i < len) {
        // One line: [i, end), without its '\r'.
        uint32_t end = i;
        while (end < len && text[end] != '\n') end++;
        uint32_t next = end + 1;
        if (end > i && text[end - 1] == '\r') end--;
        line++;
        // Skip leading blanks; ignore blank and comment lines.
        while (i < end && (text[i] == ' ' || text[i] == '\t')) i++;
        if (i == end || text[i] == '#') {
            i = next;
            continue;
        }
        uint32_t frame;
        if (!parse_uint(text, &i, end, UINT32_MAX / DECIMAL_BASE, &frame)) {
            return parse_error(err, err_cap, line, "expected a frame number");
        }
        if (i == end || (text[i] != ' ' && text[i] != '\t')) {
            return parse_error(err, err_cap, line, "expected a space and the keys after the frame number");
        }
        while (i < end && (text[i] == ' ' || text[i] == '\t')) i++;
        uint32_t spec_end = end;
        while (spec_end > i && (text[spec_end - 1] == ' ' || text[spec_end - 1] == '\t')) spec_end--;
        if (ks->count > 0 && frame <= ks->changes[ks->count - 1].frame) {
            return parse_error(err, err_cap, line, "frame numbers must increase from line to line");
        }
        if (ks->count == HOST_KEY_CHANGES_MAX) return parse_error(err, err_cap, line, "too many lines");
        HostKeyChange *c = &ks->changes[ks->count];
        if (!host_keys_spec(text + i, spec_end - i, &c->input)) {
            return parse_error(err, err_cap, line, "keys must be '-' or names like a+right, with T<x>,<y> for touch");
        }
        c->frame = frame;
        ks->count++;
        i = next;
    }
    return true;
}

void host_keys_state(const HostKeyScript *ks, uint32_t frame, dsd_input *out) {
    memset(out, 0, sizeof *out);
    // Last change at or before `frame` (binary search over increasing frames).
    uint32_t lo = 0;
    uint32_t hi = ks ? ks->count : 0;
    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        if (ks->changes[mid].frame <= frame) lo = mid + 1;
        else hi = mid;
    }
    if (lo > 0) *out = ks->changes[lo - 1].input;
}
