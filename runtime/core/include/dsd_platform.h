// dsd_platform.h: contract C11, the platform seam between the portable core (runtime/core, WS2) and a platform
// layer: libnds/maxmod on the DS (runtime/platform/ds, WS3) and the headless host runner (runtime/host, WS2).
//
// Version: 0.2.0 (0.1.0 published 2026-09-26; 0.2.0 adds dsd_core_main and dsd_plat_init's results for WS3's ADR-0004;
// frozen at CP-A; after that, changes follow contracts/README.md: an added function or field is T1, a changed
// signature or meaning T2). Source: PLAN.md 2.4, 3.2, 3.3 and 5.2 C11.
//
// Rules:
//   - Pure C11 on both sides; no libnds or maxmod type crosses the seam, only the fixed-width types below.
//   - Every function is called from the core's single thread, in the order the frame loop documents (game.c).
//   - Paths are NitroFS-relative with '/' ("game.dsdb", "gfx/spr_bird.grf"); the platform adds its root
//     ("nitro:/" on the DS, the <nitrofs-dir> argument on the host).
//   - Strings passed in are NUL-terminated unless a length is given; the platform never keeps a pointer after the
//     call returns.
//   - The platform owns hardware state; the core owns game state. Everything the platform computes that affects
//     the game (sprite sizes, load results) is derived from the same files the same way on both platforms.
#ifndef DSD_PLATFORM_H
#define DSD_PLATFORM_H

#define DSD_PLATFORM_VERSION "0.2.0" // C11 version (contracts/CHANGELOG.md)

#include <stdbool.h>
#include <stdint.h>

// ---- Placement attributes ---------------------------------------------------------------------------------------
// The only platform conditional the core sees. On the DS ARM9 they mirror libnds's ITCM_CODE / DTCM_DATA / DTCM_BSS
// (BlocksDS 1.24.0 ndstypes.h section names); on the host they compile to nothing.
#define DSD_STRINGIFY_(x) #x
#define DSD_STRINGIFY(x) DSD_STRINGIFY_(x)
#if defined(ARM9)
#define DSD_ITCM_CODE __attribute__((__section__(".itcm.text." __FILE__ "." DSD_STRINGIFY(__LINE__)), __long_call__))
#define DSD_DTCM_DATA __attribute__((__section__(".dtcm." __FILE__ "." DSD_STRINGIFY(__LINE__))))
#define DSD_DTCM_BSS __attribute__((__section__(".sbss." __FILE__ "." DSD_STRINGIFY(__LINE__))))
#else
#define DSD_ITCM_CODE
#define DSD_DTCM_DATA
#define DSD_DTCM_BSS
#endif

// ---- Shared constants -------------------------------------------------------------------------------------------
#define DSD_SCREEN_TOP 0u    // the SCREEN_TOP constant
#define DSD_SCREEN_BOTTOM 1u // the SCREEN_BOTTOM constant (the touch screen)
#define DSD_SCREEN_COUNT 2u
#define DSD_SCREEN_W 256     // pixels
#define DSD_SCREEN_H 192
#define DSD_UI_CELL_PX 8     // UI layer cell size (C13 uiLayerCellPx)
#define DSD_UI_COLS 32       // UI map is 32x32 cells; 32x24 are visible
#define DSD_UI_ROWS 24
#define DSD_UI_COLOURS 16    // the 16 GML c_* colours, one standard BG palette each

// Buttons: bit n of dsd_input.held is the button whose btn_* constant is n (contracts/dsdb.md section 7).
#define DSD_BTN_A 0u
#define DSD_BTN_B 1u
#define DSD_BTN_X 2u
#define DSD_BTN_Y 3u
#define DSD_BTN_L 4u
#define DSD_BTN_R 5u
#define DSD_BTN_START 6u
#define DSD_BTN_SELECT 7u
#define DSD_BTN_UP 8u
#define DSD_BTN_DOWN 9u
#define DSD_BTN_LEFT 10u
#define DSD_BTN_RIGHT 11u
#define DSD_BTN_COUNT 12u

// Results of the file and load calls (negative = failure).
#define DSD_PLAT_OK 0
#define DSD_PLAT_ENOENT (-1)  // no such file
#define DSD_PLAT_ETOOBIG (-2) // the file is larger than the buffer
#define DSD_PLAT_EIO (-3)     // the file exists but reading it failed
#define DSD_PLAT_EBADID (-4)  // a sound id the soundbank does not have (mmLoadEffect/mmLoad return 1)
#define DSD_PLAT_ELOAD (-5)   // loading into sprite memory, BG memory or sound RAM failed (mmLoad* return 2)
#define DSD_PLAT_ENOMEM (-6)  // no room left (sprite memory, colours, sound RAM)

// ---- Types ------------------------------------------------------------------------------------------------------

// Input state of one frame, sampled once by dsd_plat_read_input. The core derives pressed/released edges.
typedef struct dsd_input {
    uint32_t held;    // bit DSD_BTN_* set while the button is down
    int32_t touch_x;  // stylus position in bottom-screen pixels; valid while touching
    int32_t touch_y;
    uint8_t touching; // 1 while the stylus is down
    uint8_t pad[3];
} dsd_input;
_Static_assert(sizeof(dsd_input) == 16, "dsd_input layout (C11)");

// What the core needs to know about a loaded sprite; read from the GRF header on both platforms.
typedef struct dsd_sprite_info {
    uint16_t width;   // one frame's width in pixels (before OBJ-size padding)
    uint16_t height;  // one frame's height in pixels
    uint16_t frames;  // frames stacked vertically in the GRF
    uint16_t bpp;     // 4 or 8
} dsd_sprite_info;
_Static_assert(sizeof(dsd_sprite_info) == 8, "dsd_sprite_info layout (C11)");

// One shadow-OAM entry. The core builds the list per screen already sorted by (depth, instance id), with flips,
// affine sets, double size and the 128-sprite / 32-affine caps applied (PLAN.md 3.3), so the platform copies it
// into OAM without decisions of its own.
#define DSD_OAM_HFLIP 0x01u  // mirror horizontally (image_xscale = -1, no affine set)
#define DSD_OAM_VFLIP 0x02u  // mirror vertically (image_yscale = -1, no affine set)
#define DSD_OAM_AFFINE 0x04u // use affine set `affine`
#define DSD_OAM_DOUBLE 0x08u // double-size box (always set with DSD_OAM_AFFINE)
typedef struct dsd_oam_entry {
    int16_t x;        // top-left in screen pixels (view offset and double-size half extent already applied)
    int16_t y;
    uint16_t sprite;  // handle from dsd_plat_sprite_load on this screen
    uint16_t frame;   // frame index within the sprite
    uint8_t flags;    // DSD_OAM_*
    uint8_t affine;   // affine set 0..31, meaningful with DSD_OAM_AFFINE
    uint8_t priority; // BG priority: 1 for sprites in 0.1 (UI layer 0, room background 2)
    uint8_t pad;
} dsd_oam_entry;
_Static_assert(sizeof(dsd_oam_entry) == 12, "dsd_oam_entry layout (C11)");

// One affine set: the inverse transform in 8.8 fixed point, as the OAM rotation/scale parameters hold it.
typedef struct dsd_affine {
    int16_t pa;
    int16_t pb;
    int16_t pc;
    int16_t pd;
} dsd_affine;
_Static_assert(sizeof(dsd_affine) == 8, "dsd_affine layout (C11)");

// A runtime error, already printed as a DSD|ERR line (C8) when dsd_plat_fatal receives it.
typedef struct dsd_fatal {
    const char *code;    // "R530"
    const char *object;  // object name, "" when none (program form, loading)
    const char *event;   // event or function name, "" when none
    const char *file;    // project-relative DSS file, "" when unknown
    int32_t line;        // 1-based, 0 when unknown
    const char *message; // C9 voice
} dsd_fatal;

// Figures for the DSD|MEM line that only the platform knows (KB unless a count).
typedef struct dsd_mem_report {
    uint32_t heap_free_kb;              // free heap after loading
    uint32_t cstack_used_kb;            // C-stack high-water mark
    uint32_t cstack_total_kb;
    uint32_t objvram_used_kb[2];        // per screen, of 128
    uint32_t snd_used_kb;               // resident sound data, of 768 (C13 soundRamBytes)
    uint32_t pal16_used[2];             // standard OBJ palettes in use per screen, of 16
    uint32_t pal256_used[2];            // extended OBJ palettes in use per screen, of 16
} dsd_mem_report;

// ---- Called by the platform (the core's entry point, ADR-0004) -------------------------------------------------

// Runs the whole game: dsd_plat_init, game.dsdb, DSD|READY, then one frame after another (the core calls
// dsd_plat_frame_begin, dsd_plat_read_input and dsd_plat_frame_end) until the game ends. Returns 0 after DSD|EXIT,
// 1 after DSD|ERR when dsd_plat_fatal returned (on the DS it does not, and START restarts by calling this again).
// Every piece of core state is re-initialised on entry. The DS main() only calls it; the host runner uses game.h's
// dsd_game_boot/dsd_game_frame instead, to write a trace line after each frame.
int dsd_core_main(void);

// ---- Lifecycle and frame ----------------------------------------------------------------------------------------

// Brings up video, NitroFS, sound (maxmod with soundbank.bin) and input. Returns DSD_PLAT_OK, DSD_PLAT_ENOENT when
// NitroFS could not be mounted (the core reports R584 "file system"), or DSD_PLAT_ELOAD when the soundbank could not
// be loaded (R571 "soundbank.bin"); the core then stops.
int32_t dsd_plat_init(void);
// Start of a frame: clears the UI layer's back map. Called before input is read.
void dsd_plat_frame_begin(void);
// End of a frame: waits for VBlank, commits the submitted OAM lists, affine sets, UI maps and scroll offsets.
void dsd_plat_frame_end(void);
// Samples the buttons and the stylus for this frame.
void dsd_plat_read_input(dsd_input *out);

// ---- Files ------------------------------------------------------------------------------------------------------

// Reads a whole NitroFS file into buf. Returns its size in bytes (<= cap), or DSD_PLAT_ENOENT / DSD_PLAT_ETOOBIG /
// DSD_PLAT_EIO.
int32_t dsd_plat_read_file(const char *path, void *buf, uint32_t cap);

// ---- Log output (C8) --------------------------------------------------------------------------------------------

// Writes one complete protocol line, `len` bytes ending in '\n' (<= 1023 bytes), through the platform's one
// protocol. The core formats every line itself.
void dsd_plat_log(const char *line, uint32_t len);
// Called right after each DSD|READY, DSD|ERR and DSD|STAT line: the DS writes the >= 5 KB DSD|PAD| flush pad, the
// host flushes stdout.
void dsd_plat_log_flush(void);
// Shows a runtime error (the DS draws the red error box and stops). May return (the host does); the core then
// stops running the game either way.
void dsd_plat_fatal(const dsd_fatal *err);
// Fills the platform half of the DSD|MEM figures.
void dsd_plat_mem_report(dsd_mem_report *out);

// ---- Graphics ---------------------------------------------------------------------------------------------------

// Loads a sprite GRF into `screen`'s OBJ memory. Returns a handle >= 0 and fills *info, or DSD_PLAT_E*.
int32_t dsd_plat_sprite_load(uint32_t screen, const char *grf_path, dsd_sprite_info *info);
// Loads a background GRF as `screen`'s room background (BG1); grf_path NULL hides BG1 (a room screen without a
// background). DSD_PLAT_OK or DSD_PLAT_E*.
int32_t dsd_plat_bg_load(uint32_t screen, const char *grf_path);
// Scrolls `screen`'s room background to the view position (pixels).
void dsd_plat_bg_scroll(uint32_t screen, int32_t x, int32_t y);
// Hands over this frame's shadow OAM and affine sets for `screen` (n <= 128, naffine <= 32); committed at
// dsd_plat_frame_end.
void dsd_plat_oam_submit(uint32_t screen, const dsd_oam_entry *list, uint32_t n, const dsd_affine *affine,
                         uint32_t naffine);

// ---- UI layer (BG0, 8-pixel cells) ------------------------------------------------------------------------------

// Writes `len` ASCII bytes at cell (cx, cy); cells off the map are skipped; non-printable bytes draw as '?'.
void dsd_plat_ui_text(uint32_t screen, int32_t cx, int32_t cy, const char *str, uint32_t len, uint32_t colour);
// Fills a cw x ch rectangle of cells with the solid tile in `colour` (0..15).
void dsd_plat_ui_fill(uint32_t screen, int32_t cx, int32_t cy, int32_t cw, int32_t ch, uint32_t colour);
// Clears `screen`'s UI map (draw_clear).
void dsd_plat_ui_clear(uint32_t screen);

// ---- Sound ------------------------------------------------------------------------------------------------------

// Plays a loaded effect by soundbank id. Returns a handle >= 0, or -1 when no channel was free (counted as sfx_drop).
int32_t dsd_plat_sfx_play(uint32_t sound_id);
// Stops every playing instance of an effect.
void dsd_plat_sfx_stop(uint32_t sound_id);
// Starts a loaded module (looping). The core has already skipped the call when the module is playing (rule 8).
void dsd_plat_music_play(uint32_t module_id);
void dsd_plat_music_stop(void);
// True while a module is playing (maxmod mmActive). The core remembers which one (audio_is_playing, rule 8).
bool dsd_plat_music_active(void);
// Master volume, 0..4096 (Q20.12 0..1).
void dsd_plat_volume(int32_t volume_fx);

// ---- Room loading (PLAN.md 3.2; C3 per-room asset sets) ---------------------------------------------------------
// A room change runs: dsd_plat_screens_blank(true); dsd_plat_assets_free(); sprite/bg loads for both screens;
// dsd_plat_sfx_load / dsd_plat_music_load for the room's sounds; dsd_plat_screens_blank(false).

// Blanks (true) or shows (false) both screens, so a room change never shows half-loaded graphics.
void dsd_plat_screens_blank(bool blank);
// Frees the previous room's sprites, backgrounds, effects and module (stops the music).
void dsd_plat_assets_free(void);
// Loads one effect into sound RAM (mmLoadEffect). DSD_PLAT_OK, DSD_PLAT_EBADID or DSD_PLAT_ELOAD.
int32_t dsd_plat_sfx_load(uint32_t sound_id);
// Loads one music module (mmLoad). DSD_PLAT_OK, DSD_PLAT_EBADID or DSD_PLAT_ELOAD.
int32_t dsd_plat_music_load(uint32_t module_id);

// ---- Time and randomness ----------------------------------------------------------------------------------------

// Milliseconds since dsd_plat_init (wraps). Never used for game logic, only for DSD|STAT pacing.
uint32_t dsd_plat_millis(void);
// Seed for the core's xorshift32 when the DSDB header seed is 0 (RTC + frame counter on the DS, --seed N on the
// host). A non-zero header seed always wins (C2).
uint32_t dsd_plat_rng_seed(void);

#endif // DSD_PLATFORM_H
