// host.h: the host runner's platform layer (runtime/host), shared by dsdude-host (main.c) and the host test runner
// (runtime/tests). Host-only code: it may use stdio and the C library freely, never from runtime/core.
#ifndef DSD_HOST_H
#define DSD_HOST_H

#include <stdbool.h>
#include <stdint.h>

#include "dsd_platform.h"

// ---- Key scripts (--input; format in contracts/log-protocol.md "Host runner") -----------------------------------
#define HOST_KEY_CHANGES_MAX 8192 // lines in one key script
#define HOST_KEY_ERR_MAX 160      // longest parse error message

// From `frame` on (until the next change), the input is `input`.
typedef struct HostKeyChange {
    uint32_t frame;
    dsd_input input;
} HostKeyChange;

typedef struct HostKeyScript {
    HostKeyChange changes[HOST_KEY_CHANGES_MAX];
    uint32_t count;
} HostKeyScript;

// Parses a key script. Returns true, or false with a "line N: ..." message in err.
bool host_keys_parse(HostKeyScript *ks, const char *text, uint32_t len, char *err, uint32_t err_cap);
// The input held at `frame` (nothing held and no touch before the first change).
void host_keys_state(const HostKeyScript *ks, uint32_t frame, dsd_input *out);
// Parses one input spec ("-", "a+right", "T128,96", "b+T3,4") into *out. False when malformed.
bool host_keys_spec(const char *spec, uint32_t len, dsd_input *out);

// ---- Configuration ----------------------------------------------------------------------------------------------

// Receives every protocol line (with its '\n') instead of stdout, e.g. to capture output in tests.
typedef void (*HostLogSink)(const char *line, uint32_t len, void *ctx);

typedef struct HostConfig {
    const char *root;            // the NitroFS directory, or a .dsdb file served as game.dsdb
    uint32_t seed;               // what dsd_plat_rng_seed returns (--seed N)
    const HostKeyScript *keys;   // NULL: no input
    HostLogSink sink;            // NULL: write lines to stdout
    void *sink_ctx;
} HostConfig;

// Applies a configuration and resets the frame counter and the fatal flag. Call before dsd_game_boot.
void host_configure(const HostConfig *cfg);
// True after the core called dsd_plat_fatal.
bool host_fatal_seen(void);
// Frames completed (dsd_plat_frame_end calls).
uint32_t host_frame_count(void);

#endif // DSD_HOST_H
