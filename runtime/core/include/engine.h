// engine.h: the room-game engine: the frame in contracts/events.md order, events with inheritance, `with` loops,
// rooms and room changes, input edges, built-in variables. Program-form DSDBs never start it.
#ifndef DSD_ENGINE_H
#define DSD_ENGINE_H

#include <stdbool.h>
#include <stdint.h>

#include "dsd_platform.h"
#include "instances.h"
#include "vm.h"
#include "world.h"

#define DSD_NO_ROOM 0xFFFFFFFFu
#define DSD_RT_WITH_DEPTH 32u          // nested `with` loops
#define DSD_RT_WITH_ITEMS 2048u        // instance snapshots of all open `with` loops together
#define DSD_ROOM_SPEED 60              // frames per second (room_speed)
#define DSD_STAT_EVERY 60u             // frames between DSD|STAT lines
#define DSD_EV_CREATION_CODE DSD_EV_CREATION_CODE_ID

// One open `with` loop: its snapshot is with_items[base .. base + count).
typedef struct DsdWithLoop {
    uint32_t base;
    uint32_t count;
    uint32_t pos;          // index of the instance running the body now
    uint32_t saved_self;
    uint32_t saved_other;
} DsdWithLoop;

typedef struct DsdEngine {
    DsdVm *vm;
    const DsdProgram *prog;
    const DsdWorld *world;
    uint32_t room;                 // current ROOM index
    uint32_t loaded_room;          // room whose asset set is loaded (DSD_NO_ROOM: none)
    uint32_t pending_room;         // room change requested this frame, or DSD_NO_ROOM
    bool pending_game_restart;
    bool game_started;             // Game Start ran (reset by game_restart)
    bool ending;                   // game_end() was called: Game End and DSD|EXIT at the end of the frame
    uint32_t frame;                // frames run
    int32_t view_x[2];             // pixels, per screen
    int32_t view_y[2];
    // Input of this frame and the previous one (edges); touch in room coordinates, kept while the stylus is up.
    dsd_input input;
    uint32_t held_prev;
    bool touching_prev;
    int32_t touch_x;
    int32_t touch_y;
    // Drawing state (UI layer): the screen draw_* calls target and the UI colour.
    uint32_t draw_screen;
    bool draw_screen_set;          // draw_set_screen was called in this Draw event
    uint32_t draw_colour;
    // Audio: the module playing (ASET index) or -1; effects that found no channel.
    int32_t music;
    uint32_t sfx_drops;
    // Sprite handles per screen for the loaded asset set (-1 = not loaded on that screen).
    int16_t sprite_handle[2][DSD_RT_ASSETS_MAX];
    // `with` loops.
    DsdWithLoop with_loops[DSD_RT_WITH_DEPTH];
    uint32_t with_depth;
    uint16_t with_items[DSD_RT_WITH_ITEMS];
    uint32_t with_top;
    uint32_t ops_last;             // VM steps of the last frame (trace, DSD|STAT)
} DsdEngine;

extern DsdEngine dsd_engine;

// Starts a room game: resets instances, loads the first room (Create, Game Start, Room Start). DSD_GAME_* state.
int32_t dsd_engine_boot(DsdVm *vm, const DsdProgram *prog, const DsdWorld *world);
// Runs one frame. DSD_GAME_RUNNING, DSD_GAME_EXITED (DSD|EXIT printed) or DSD_GAME_FAILED (the VM error is pending:
// the caller reports it).
int32_t dsd_engine_frame(void);

// Runs `event_id` for instance `idx` (own or inherited handler) with `other`; nothing when it has no handler.
// False when the script raised an error.
bool dsd_engine_event(uint32_t idx, uint32_t event_id, uint32_t other);
// Runs the parent's version of the running event (event_inherited).
bool dsd_engine_event_inherited(void);
// Creates an instance of `obj` at (x, y) (Q20.12) on `screen` and runs its Create event with `other` = creator.
// *out_idx gets its pool index. False on an error (R5xx raised, e.g. the pool is full).
bool dsd_engine_create(uint32_t obj, int32_t x, int32_t y, uint32_t screen, uint32_t creator, uint32_t *out_idx);
// Destroys a live instance: marks it dead and runs its Destroy event.
bool dsd_engine_destroy(uint32_t idx);

// Instances a target value names, in creation order: an object (with its descendants), an instance id, self (-1),
// other (-2), all (-3), noone (-4). Writes up to `cap` pool indices and returns how many match.
uint32_t dsd_engine_targets(DsdValue target, uint16_t *out, uint32_t cap);
// The one instance a target names for reading (the first match). Raises R502/R503 and returns DSD_NO_INST when
// there is none; `what` names the variable for the message.
uint32_t dsd_engine_target_one(DsdValue target, const char *what);

// True when the stylus is down on instance idx's bbox (bottom-screen instances only; touch_* events).
bool dsd_engine_stylus_on(uint32_t idx);

// Built-in variables (dense index `var`, element `index` for the array ones) of instance `idx` (ignored for
// globals). False after raising R542/R550/R521.
bool dsd_bivar_get(uint32_t idx, uint32_t var, int32_t index, DsdValue *out);
bool dsd_bivar_set(uint32_t idx, uint32_t var, int32_t index, DsdValue v);

// `with` loop opcodes (vm.arm.c). begin: false with *empty when nothing matched; next: true while instances remain.
bool dsd_with_begin(DsdValue target, DsdValue *state, bool *empty);
bool dsd_with_next(DsdValue state);
void dsd_with_end(DsdValue state);

#endif // DSD_ENGINE_H
