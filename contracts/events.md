# C6: Events and the frame

Version: 0.1.0 · Owner: WS4 (WS2 co-signs) · Changes: see the tiers in contracts/README.md

Which events exist, how their files are named, in what order the engine runs them each frame, and what happens when a
room loads or changes. Written by WS0 in Phase 0 (v0.1); owner WS4 from the tag, with WS2 as co-signer (WS0 holds
it until `start-ws4`). The event **kinds are numbered in the order of the table below**; `contracts/dsdb.md`
section 7 encodes them as `kind << 16 | arg`. Source: PLAN.md sections 3.2, 3.3, 4 and 5.2 C6.

## 1. Event files

One file per event under `objects/<obj>/`; the stem is the event.

| Kind | File | When it runs |
|---|---|---|
| 0 | `create.dss` | once, when the instance is created (placed in a room or by `instance_create`) |
| 1 | `destroy.dss` | once, when `instance_destroy` removes it (not on room change) |
| 2 | `begin_step.dss` | every frame, Begin Step stage |
| 3 | `step.dss` | every frame, Step stage |
| 4 | `end_step.dss` | every frame, End Step stage |
| 5 | `alarm_0.dss` .. `alarm_7.dss` | when that alarm counts down to 0 |
| 6 | `draw.dss` | every frame, Draw stage (replaces the default `draw_self()`) |
| 7 | `collision_<object>.dss` | every frame the instance's bbox overlaps an instance of `<object>` (or a descendant) on the same screen |
| 8 | `button_pressed_<btn>.dss` | the frame the button goes down |
| 9 | `button_released_<btn>.dss` | the frame the button goes up |
| 10 | `button_held_<btn>.dss` | every frame the button is down |
| 11 | `touch_pressed.dss` | the frame the stylus touches this instance's bbox (bottom-screen instances only) |
| 12 | `touch_released.dss` | the frame the stylus lifts after touching this instance |
| 13 | `touch_held.dss` | every frame the stylus is on this instance's bbox |
| 14 | `global_touch_pressed.dss` | the frame the stylus touches the touch screen anywhere (any instance, either screen) |
| 15 | `global_touch_released.dss` | the frame the stylus lifts |
| 16 | `global_touch_held.dss` | every frame the stylus is down |
| 17 | `game_start.dss` | once per game, after the first room's Create events (again after `game_restart`) |
| 18 | `game_end.dss` | on `game_end()`, before the game stops |
| 19 | `room_start.dss` | after a room's instances are created (and after Game Start in the first room) |
| 20 | `room_end.dss` | when the room is left (`room_goto`, `room_restart`, `game_restart`) |
| 21 | `animation_end.dss` | the frame `image_index` wraps past the last frame |
| 22 | `outside_room.dss` | once, when the instance's bbox becomes fully outside the room (section 5) |
| 23 | `user_0.dss` .. `user_7.dss` | only through `event_user(n)` |

`<btn>` is one of `a b x y l r start select up down left right` (in that order, the `btn_*` values 0-11).
`<object>` is an object name. Any other `.dss` stem in an object folder (except `functions.dss`) is E3xx.

Touch coordinates: `touch_x`/`touch_y` are the stylus position plus the bottom screen's view offset, in room
coordinates, and keep their last value while the stylus is up. `touch_*` events only fire for instances whose
`screen` is bottom; `global_touch_*` events and the `touch_check/pressed/released()` builtins work for instances on
either screen.

## 2. The frame (C6 frame order)

Every frame (60 per second), in this order:

1. **Input**: read buttons and the touch screen once; every event and builtin in the frame sees the same state.
2. **Begin Step**.
3. **Alarms**: for each instance, for alarms 0-7 in order, an alarm whose value is > 0 is decremented; if it reaches
   0 it is set to -1 and `alarm_N` runs. Setting an alarm to 0 or -1 disables it (it does not fire).
4. **Button, Touch, Global Touch** events, in kind order (8-16), then button order.
5. **Step**.
6. **Built-in motion**, in one native loop per instance: `xprevious = x`, `yprevious = y`; friction reduces `speed`
   toward 0; gravity adds `gravity` in `gravity_direction` to the motion; then `x += hspeed`, `y += vspeed`
   (`speed`/`direction` and `hspeed`/`vspeed` are two views of the same motion, kept in sync).
7. **Collisions** (section 6).
8. **End Step**.
9. **Animation**: `image_index += image_speed`; when it passes `image_number` it wraps, and `animation_end` runs.
10. **Outside Room** (section 5).
11. **Draw**: instances with `visible = true` run `draw.dss`, or `draw_self()` when they have none. Drawing builtins
    are allowed only here (C2 `allowedEvents`). Sprites stack by (depth, instance id): lower depth in front.
12. **VBlank commit**: shadow OAM and the UI layer go to the hardware; a pending room change happens now (section 4).

**Which instances take part.** Each stage iterates a snapshot of the live instances in creation order, taken when the
stage begins. An instance created during a stage runs its Create event at once and joins from the next stage. An
instance destroyed during a stage runs its Destroy event at once, is skipped by everything after that in the frame
(including `with` loops and collision checks), and is freed at the end of the frame.

## 3. Inheritance

- A child object without an event file runs its parent's (and so on up the chain).
- `event_inherited()` inside an event runs the parent's version of the same event.
- `collision_<parent>` matches the parent's descendants too, as do `with (parent)`, `instance_*` and
  `place_meeting(..., parent)`.
- A child's `functions.dss` may call its parent's functions; a child function with the same name overrides it.

## 4. Rooms

**Room load order.** For each instance in `room.json` order: create it (Create event, then its creation code). Then,
in the first room of the game only, Game Start for every instance in creation order. Then Room Start for every
instance in creation order.

**Room changes.** `room_goto`, `room_goto_next`, `room_goto_previous` and `room_restart` take effect at the end of the
frame (VBlank commit):
1. Room End runs for every instance in creation order. Destroy does **not** run.
2. All instances are removed; `global.*` stays (language.md rule 7).
3. Both screens are blanked (`setBrightness`) while loading.
4. The new room's asset set is loaded (C3); assets are not reloaded when the set is unchanged (`room_restart`). The
   music module and the room's sound effects are loaded before Room Start.
5. The new room's load order runs (without Game Start), then the screens are shown again.

`game_restart()` clears `global.*`, then goes to the first room as if the game had just started (Game Start runs
again). `game_end()` runs Game End for every instance, then the runtime prints `DSD|EXIT|0` and stops.

Using an asset that is not in the current room's loaded set raises R5xx "spr_x is not loaded in rm_y"; the checker
warns statically when it can prove this.

## 5. Outside Room

Outside Room fires **once** when an instance whose bbox has been inside or overlapping the room rectangle
`(0, 0, room_width, room_height)` becomes fully outside it. An instance created outside the room does not fire until
it has entered the room and then left again. After firing, it fires again only after re-entering. (Flappy's pipes
spawn at x = 272, scroll in, and fire once when they leave on the left.)

## 6. Collisions

- **Same screen only.** Collision events, `place_meeting`, `instance_place` and `collision_*` only match instances
  with the same `screen` (a room is one coordinate space, and each screen shows its own view of it).
- Shapes are the sprites' bboxes (`sprite.json` `bbox`, scaled by `image_xscale`/`image_yscale`, not rotated) at the
  instances' positions; an instance without a sprite has no bbox and never collides. Visible-off instances collide.
- Detection: a uniform-grid broadphase, then AABB overlap (touching edges do not overlap).
- For each instance in creation order that has a `collision_<obj>` event (own or inherited), the event runs once for
  each overlapping instance of `<obj>` or its descendants, in creation order, with `other` set to that instance. Both
  sides run their own events.

## How to change me

- T0 (wording, examples): WS4 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new event kind appended to the table, a new optional behaviour): minor version bump, `packages/dsdb`'s event
  table and a conformance fixture in the same commit, CHANGELOG entry; WS2 co-signs.
- T2 (renumbering kinds, changing the frame order, the room load order or the collision rules): an ADR co-signed by
  WS2, WS4 and WS7.
