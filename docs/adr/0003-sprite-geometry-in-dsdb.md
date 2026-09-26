# ADR-0003: Sprite geometry (frame size, origin, bbox) reaches the runtime through the DSDB

- Status: **proposed** (WS2, 2026-09-26). Needs WS4's co-signature (C2 co-owner, `packages/dsdb`) and WS5's
  review (C3); WS0 numbers, decides with the user if needed, and merges. If another ADR took number 0003 in the
  meantime, WS0 renumbers this one.
- Affected streams: WS2 (loader, instances, collision, draw lists), WS4 (compiler, `packages/dsdb` encode/decode and
  `.dsda`), WS5 (C3 asset pack, only if option B is chosen), WS7 (manual: nothing user-visible changes).
- Sources: `contracts/events.md` section 6 (collisions use "the sprites' bboxes (`sprite.json` `bbox`, scaled by
  `image_xscale`/`image_yscale`)"), `contracts/project-format.md` (`sprite.json` `origin`, `bbox`, `frameWidth`,
  `frameHeight`), `contracts/dsdb.md` sections 2 and 4 (ASET: `{kind, pad, pad, nameStr, pathStr, aux}`, `aux` =
  frame count), PLAN.md 3.3 (instance blocks cache a bbox; OAM placement is origin-correct).

## Context

The runtime needs, per sprite: the frame size, the origin (`x`/`y` are the origin's position; OAM placement and
rotation are origin-relative) and the bbox (collisions, `place_meeting`, `touch_*` events, Outside Room,
`bbox_left..bbox_bottom`). These live in `sprites/<name>/sprite.json`. Today nothing carries origin or bbox to the
runtime:

- the DSDB ASET entry has only the NitroFS path and `aux` (the frame count); its free bytes are 3 pad bytes;
- the GRF gives the (padded) frame size, but not the origin or the bbox;
- `AssetManifest` (C4, provisional until C3) is a build-side JSON file, not something the runtime reads.

The section table is frozen at ten sections (a new section would be T2). The header's last word (offset 28,
`reserved = 0`) is reserved space, and C2's own tiers make "a new section field in reserved space" a T1 change.

WS2 needs this for tier v2 (instances and events, ~D+14): collisions and `draw_self` placement.

## Decision (proposed): option A, a DSDB extension table in the reserved header word

1. Header offset 28 becomes `u32 extOffset`: 0 = no extensions (every DSDB written so far stays valid and means the
   same); otherwise the file offset (4-aligned, after the ten sections) of an extension table
   `u32 count; count x {u8[4] tag; u32 offset; u32 size}`, sorted by tag. A loader skips tags it does not know.
2. The first extension is `SPRG`, sprite geometry: `u32 count;` then 20-byte records, sorted by asset index, one per
   ASET sprite entry:

   | Type | Field |
   |---|---|
   | u32 | ASET index of the sprite |
   | u16, u16 | frameWidth, frameHeight (`sprite.json`) |
   | s16, s16 | origin x, y |
   | s16, s16, s16, s16 | bbox left, top, right, bottom (inclusive, frame pixels) |

3. `.dsda`: `.asset sprite NAME PATH FRAMES` gains optional `origin=X,Y size=W,H bbox=L,T,R,B` fields; the assembler
   writes `SPRG` when any sprite has them. Canonical form prints them when present.
4. Versioning: C2 minor bump (0.2.0 of `dsdb.md`, T1), format minor 1 -> 2 in the header (the loader accepts minor
   >= 1 with major 0, as today). The ABI hash does not change (builtins untouched).
5. The runtime refuses a room game whose sprites lack SPRG records (R580 "sprite geometry"), and uses the GRF only
   for the pixel data.

## Consequences

- One file (`game.dsdb`) holds everything the engine's logic needs; host runs need no GRF parsing to collide, so
  host traces of room games work from the DSDB alone plus the GRFs only for `--png-dir`.
- WS4 emits the records from `sprite.json` (the compiler already reads the project) and updates `packages/dsdb`;
  WS2 updates the loader and fixtures; `gen-dsdb` regenerates fixtures (no byte changes for files without SPRG).
- The extension table is the pattern for later additions (e.g. room tile data in v1.1) without another T2.

## Alternatives

- **B. A NitroFS metadata file from the asset pipeline** (`gfx/<sprite>.meta` or one `sprites.bin`, C3/WS5): keeps
  graphics facts with graphics, but splits the engine's logic inputs across two producers and two formats, and the
  host runner would need the asset build for any collision test (the cloud cannot run grit).
- **C. Read origin/bbox from the GRF:** GRF has no such fields; a custom chunk would need grit changes or a post-pass.
- **D. Use the full frame as bbox and the top-left as origin:** wrong for every imported sprite (new imports default
  to the frame centre and the opaque bounds), and Flappy's pipes (ADR-0001) depend on real bboxes.
- **E. A new eleventh section:** changes the frozen section count, so T2 with a format-major bump.
