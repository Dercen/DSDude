# ADR-0001: Flappy pipe geometry

- Status: **proposed** (WS0, 2026-09-25). The user decides; WS0 merges.
- Affected streams: WS4 (owns `samples/flappy` until M2), WS7 (owns it from M2 and writes the tutorial from it),
  WS2 (its deterministic flappy trace, `fixtures/runtime-core/`), WS5 (the sample's asset budgets).
- Sources: PLAN.md section 4 (the Flappy listing), `docs/kickoff/ws0.md` task 4.

## Context

`samples/flappy` v0 copies the section 4 listing as written. `obj_ctrl`'s `alarm_0.dss` spawns one `obj_pipe` and one
`obj_gap` at the same height:

```js
var gy = irandom_range(48, 144);
instance_create(272, gy, obj_pipe);
instance_create(272, gy, obj_gap);
alarm[0] = 90;
```

`spr_pipe` is 32x64 with origin (16, 0), so the pipe covers `gy .. gy+63`, and `spr_gap` is 8x48 with origin
(4, 24), so the gap trigger covers `gy-24 .. gy+23`. That is one 64-px block that overlaps the scoring gap, not an
upper and a lower pipe with a gap between them: the bird can fly over or under the pipe, and flying through the
"gap" scores and can hit the pipe at the same time.

## Decision (recommended)

Spawn two pipes around the gap and make each pipe 128 px tall:

```js
// objects/obj_ctrl/alarm_0.dss
var gy = irandom_range(48, 144);
instance_create(272, gy - 152, obj_pipe);   // upper pipe: gy-152 .. gy-25
instance_create(272, gy + 24, obj_pipe);    // lower pipe: gy+24 .. gy+151
instance_create(272, gy, obj_gap);          // score trigger: gy-24 .. gy+23
alarm[0] = 90;

// objects/obj_pipe/create.dss
hspeed = -2;
image_yscale = 2;   // 128 px, within the 2x scale limit
```

For every `gy` in 48..144 the upper pipe starts at or above y = -8 (so it reaches the top of the 192-px room) and
the lower pipe ends at or below y = 199 (so it reaches the bottom). The 48-px gap is then the only way through, and
the gap trigger fills it exactly.

Cost: each pipe is scaled, so it uses an affine slot (double-size OBJ, 64x128 box). At 2 px per frame a pipe pair
stays on screen for ~150 frames and a new pair comes every 90 frames, so at most 2 pairs (4 affine slots of 32 per
screen) are visible.

## Alternatives

1. **Keep one pipe** (the listing as written). Simplest, but it is not Flappy Bird and teaches the wrong geometry in
   the tutorial's first chapter.
2. **Two sprites, `spr_pipe_top` and `spr_pipe_bottom`, 32x128 each.** No scaling and no affine slots, but 32x128 is
   larger than the biggest OBJ (64x64): the pipeline would have to split it into two OBJs, which C3 does not do in
   0.1 (frames larger than 64x64 are E4xx).
3. **`image_yscale = -2` on the upper pipe** so its lip faces the gap. Nicer to look at; same geometry with the
   upper pipe's origin at its bottom. Can be a later polish by WS7.

## Migration

If accepted, WS4 (before M2) or WS7 (after M2) applies the two edits to `samples/flappy` in one commit, and WS7's
tutorial listing follows. WS2 regenerates its flappy trace goldens in the same checkpoint. PLAN.md section 4 gets a
note pointing here (WS0).
