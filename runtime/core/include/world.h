// world.h: the game's static world from a DSDB: objects (OBJS), rooms (ROOM) and assets (ASET), parsed and checked
// once at load (contracts/dsdb.md section 4) so the engine reads them without bounds checks.
#ifndef DSD_WORLD_H
#define DSD_WORLD_H

#include <stdbool.h>
#include <stdint.h>

#include "dsdb.h"

#define DSD_RT_OBJECTS_MAX 256      // objects per game (runtime table size; more is R583)
#define DSD_RT_ROOMS_MAX 128        // rooms per game
#define DSD_RT_ASSETS_MAX 1024      // ASET entries per game
#define DSD_NO_EVENT 0xFFFFFFFFu    // "no handler" from dsd_world_event

// Event kinds (contracts/events.md table order; contracts/dsdb.md section 7: eventId = kind << 16 | arg).
#define DSD_EV_CREATE 0u
#define DSD_EV_DESTROY 1u
#define DSD_EV_BEGIN_STEP 2u
#define DSD_EV_STEP 3u
#define DSD_EV_END_STEP 4u
#define DSD_EV_ALARM 5u
#define DSD_EV_DRAW 6u
#define DSD_EV_COLLISION 7u
#define DSD_EV_BUTTON_PRESSED 8u
#define DSD_EV_BUTTON_RELEASED 9u
#define DSD_EV_BUTTON_HELD 10u
#define DSD_EV_TOUCH_PRESSED 11u
#define DSD_EV_TOUCH_RELEASED 12u
#define DSD_EV_TOUCH_HELD 13u
#define DSD_EV_GLOBAL_TOUCH_PRESSED 14u
#define DSD_EV_GLOBAL_TOUCH_RELEASED 15u
#define DSD_EV_GLOBAL_TOUCH_HELD 16u
#define DSD_EV_GAME_START 17u
#define DSD_EV_GAME_END 18u
#define DSD_EV_ROOM_START 19u
#define DSD_EV_ROOM_END 20u
#define DSD_EV_ANIMATION_END 21u
#define DSD_EV_OUTSIDE_ROOM 22u
#define DSD_EV_USER 23u
#define DSD_EV_KIND_COUNT 24u
#define DSD_EV_KIND_SHIFT 16
#define DSD_EV_ARG_MASK 0xFFFFu
#define DSD_EV_CREATION_CODE_ID 0xFFFF0000u // pseudo event id: a placed instance's creation code
#define DSD_EVENT_ID(kind, arg) (((uint32_t)(kind) << DSD_EV_KIND_SHIFT) | (uint32_t)(arg))

// ASET entry (16 bytes, read in place).
typedef struct DsdAssetRec {
    uint8_t kind;        // DSD_ASSET_SPRITE .. DSD_ASSET_MUSIC (value.h)
    uint8_t pad8;
    uint16_t pad16;
    uint32_t name_str;
    uint32_t path_str;   // NitroFS path ("" for sounds)
    uint32_t aux;        // sprite frame count, or soundbank id
} DsdAssetRec;
_Static_assert(sizeof(DsdAssetRec) == 16, "ASET entry is 16 bytes (C2)");

// A placed instance in a room (20 bytes, read in place).
typedef struct DsdRoomInstRec {
    uint32_t object;
    int32_t x;           // whole pixels
    int32_t y;
    uint8_t screen;      // 0 top, 1 bottom
    uint8_t pad8;
    uint16_t pad16;
    int32_t creation_func; // FUNC index or -1
} DsdRoomInstRec;
_Static_assert(sizeof(DsdRoomInstRec) == 20, "ROOM instance record is 20 bytes (C2)");

typedef struct DsdObject {
    uint32_t name_str;
    int32_t parent;              // object index or -1
    int32_t sprite;              // ASET index or -1
    uint8_t visible;
    uint8_t screen;
    int16_t depth;
    uint16_t slot_count;
    uint16_t event_count;
    const uint32_t *ancestors;   // bitset over objects: bit j = object j is this object or an ancestor
    const uint32_t *slots;       // slot_count pairs {symbolId, slot}, sorted by symbolId
    const uint32_t *events;      // event_count pairs {eventId, func}, sorted by eventId
} DsdObject;

typedef struct DsdRoom {
    uint32_t name_str;
    uint16_t width;
    uint16_t height;
    int32_t background[2];       // per screen: ASET index or -1
    int32_t view_x[2];
    int32_t view_y[2];
    uint32_t inst_count;
    const DsdRoomInstRec *insts;
    uint16_t sprite_count[2];    // per-screen asset set (C3): sprites, then backgrounds
    uint16_t bg_count[2];
    const uint32_t *set[2];      // sprite_count + bg_count ASET indices per screen
    uint16_t sound_count;
    const uint32_t *sounds;      // ASET indices of sounds and music loaded before Room Start
} DsdRoom;

typedef struct DsdWorld {
    uint32_t object_count;
    DsdObject objects[DSD_RT_OBJECTS_MAX];
    uint32_t room_count;
    DsdRoom rooms[DSD_RT_ROOMS_MAX];
    uint32_t asset_count;
    const DsdAssetRec *assets;
    uint32_t sprg_count;         // sprite geometry records (ADR-0006), one per sprite asset, by asset index
    const DsdSprgRec *sprg;
} DsdWorld;

// Parses and checks OBJS, ROOM and ASET of a loaded program (called by dsd_load). R580/R583 on failure.
int32_t dsd_world_load(DsdWorld *w, const DsdProgram *prog, DsdLoadError *err);

// True when object `obj` is `ancestor` or descends from it.
static inline bool dsd_world_is_a(const DsdWorld *w, uint32_t obj, uint32_t ancestor) {
    return (w->objects[obj].ancestors[ancestor >> 5] >> (ancestor & 31u)) & 1u;
}
// The handler of `event_id` for `obj`, searching the parent chain from `obj` (event inheritance). Returns the FUNC
// index or DSD_NO_EVENT, and the object that owns the handler in *owner (for event_inherited).
uint32_t dsd_world_event(const DsdWorld *w, uint32_t obj, uint32_t event_id, uint32_t *owner);
// The slot of symbol `sym` in `obj`'s layout, or -1.
int32_t dsd_world_slot(const DsdWorld *w, uint32_t obj, uint32_t sym);

#endif // DSD_WORLD_H
