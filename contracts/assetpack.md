# C3: Asset pack layout and manifest

Version: 0.2.0 · Owner: WS5 · Changes: see "How to change me" below and the tiers in contracts/README.md

What `packAssets()` (`@dsdude/asset-pipeline`, C4 `PackAssetsFn`) writes into a project's build folder, how every
file is made, the limits it enforces and the `assets.manifest.json` schema that the compiler (WS4), BuildService
(WS1/WS8), the runtime (WS2/WS3) and the IDE meters (WS6) read. Sources: PLAN.md sections 2.9, 3.2 (steps 4-5) and
5.2 C3; `docs/research/verification.md` claims 3, 5 and 9. Numbers come from C13 (`contracts/runtime-limits.json`)
and are quoted here by key; if a value here and C13 disagree, C13 wins.

## 1. Build-folder layout

`<build>` is `<DSDUDE_HOME>/build/<project-hash>/` (C4). `packAssets(project, toolPaths, outDir)` writes only under
`outDir`:

| Path | What |
|---|---|
| `nitrofs/gfx/<sprite>.grf` | one GRF per sprite (section 3) |
| `nitrofs/bg/<background>.grf` | one GRF per background (section 4) |
| `nitrofs/soundbank.bin` | the maxmod soundbank; absent when the project has no sounds (section 5) |
| `soundbank.h` | mmutil's id header, kept next to the pack for diagnosis; never packed |
| `icon.png` | the ndstool `-b` icon (section 6); absent when the project has no icon file |
| `cache/<sha256>/` | conversion cache (section 8) |
| `assets.manifest.json` | the manifest (section 7) |

The NitroFS root is `nitrofs/`: `game.dsdb` (written by BuildService from the compiler, C2), `gfx/`, `bg/` and
`soundbank.bin`. The built-in 8x8 UI font is linked into `arm9.elf` and is not a NitroFS file; `font.grf` is
reserved for v1.1 custom fonts. `packAssets` deletes GRFs in `gfx/` and `bg/` that no longer belong to an asset, so
a renamed sprite leaves nothing behind.

## 2. Names

- Asset names are C1 names (`^[A-Za-z_][A-Za-z0-9_]{0,62}$`): ASCII, <= 63 chars, no `.`. They are therefore valid
  NitroFS names (ASCII 0x20-0x7E, <= 127 chars; ndstool does not check and longer names corrupt the FNT, claim 3)
  and valid mmutil stems (no `.`, <= 63 chars, claim 9). The pipeline re-checks both rules anyway (E420).
- File names are the asset name plus a lower-case extension: `gfx/spr_bird.grf`, `bg/bg_sky.grf`.
- Two sprites, two backgrounds or two sounds whose names differ only in letter case are E412: they would share a
  file on Windows and a `SFX_`/`MOD_` define in `soundbank.h`.
- "Sorted by name" everywhere in this contract means sorted by the name's UTF-16 code units (JavaScript's default
  sort; for C1 names this is ASCII order, so `Z` < `_` < `a`).

## 3. Sprites (`gfx/<sprite>.grf`)

Input: `sprites/<n>/sheet.png` (a horizontal strip of `frames` frames, each `frameWidth` x `frameHeight`) and
`sprite.json` (C1).

1. **Decode** the PNG to RGBA8 (pngjs; every PNG colour type and bit depth). A sheet that is not exactly
   `frames * frameWidth` x `frameHeight` pixels is E402.
2. **Transparency.** A pixel is transparent when its alpha is < 128, or when its colour, converted to RGB555 (step
   3), equals the `transparent` colour of `sprite.json` (`"#rrggbb"`). With `"alpha"` and a sheet that has no
   pixel with alpha < 128, magenta (`#ff00ff`) pixels are transparent instead. The import dialog's "top-left pixel"
   choice writes that pixel's colour into `transparent`. Transparent pixels become index 0.
3. **RGB555.** Each 8-bit channel becomes 5 bits by `c5 = floor((c8 * 31 + 127) / 255)`. An opaque pixel that
   lands on exact magenta (31, 0, 31) is moved to (31, 0, 30), because index 0 is magenta (step 6).
4. **Colour mode.** `"16"` builds 4bpp with up to 15 opaque colours, `"256"` 8bpp with up to 255. `"auto"` picks 16
   when the sheet has <= 15 distinct opaque RGB555 colours, else 256.
5. **Colour reduction.** When the sheet has more opaque colours than the mode allows, the 32x32x32 RGB555
   histogram is reduced by median cut to 15 or 255 colours, refined by up to 4 Lloyd (k-means) passes (each source
   colour joins its nearest palette colour, ties to the lower index; each palette colour moves to the rounded,
   population-weighted mean of its members; a colour nobody joins stays; stop when nothing moves), and every opaque
   pixel is mapped to its nearest palette colour (squared RGB555 distance; ties go to the lower index). There is no dithering in 0.1 (C1 has no field for
   it; the preview API may offer it). Reduction is always the **warning** E407, never an error, and the diagnostic
   says how many colours were merged; the import dialog shows the preview (C12).
6. **Palette.** Index 0 is magenta (`#ff00ff`, the colour grit's `-gTFF00FF` makes transparent). Indices 1.. are
   the opaque colours sorted by their DS value `b << 10 | g << 5 | r`, ascending. The palette always has 16
   entries in 16-colour mode and 256 in 256-colour mode; unused entries are black.
7. **Padding.** A frame larger than 64 pixels in either dimension is E401. Every other frame is padded with index 0,
   on the right and at the bottom, to the smallest of the 12 OBJ sizes that contains it: 8x8, 16x8, 8x16, 16x16,
   32x8, 8x32, 32x16, 16x32, 32x32, 64x32, 32x64, 64x64 (the smallest containing size is always unique). `origin`
   and `bbox` stay valid because content keeps its top-left corner.
8. **Stitching.** The padded frames are stacked vertically, frame 0 on top, into an indexed PNG that is one padded
   frame wide (`paddedWidth` x `frames * paddedHeight`). The PNG is written by the pipeline itself (IHDR, PLTE,
   tRNS with index 0 fully transparent, IDAT, IEND; 8-bit indices; zlib level 9), so the bytes are deterministic.
9. **grit** (BlocksDS 1.24.0, the release of the runtime's libnds; claim 5):
   - 256 colours: `grit <sheet>.png -gB8 -gt -gTFF00FF -m! -ftr -fh! -W1 -o <out>`
   - 16 colours: `grit <sheet>.png -gB4 -pn16 -gt -gTFF00FF -m! -ftr -fh! -W1 -o <out>`

The GRF therefore holds the tiles of the whole sheet (row-major 8x8 tiles, frame after frame) and the palette.

**Frame layout for the runtime.**
- `frameBytes = (paddedWidth / 8) * (paddedHeight / 8) * 64` at 8bpp, `* 32` at 4bpp. Frame `i` starts at byte
  `i * frameBytes` of the GRF's GFX chunk.
- The OBJ memory uploader places each frame at a 128-byte-aligned offset (`SpriteMapping_1D_128`), so a frame
  occupies `frameStrideBytes = roundUp(frameBytes, objVramAlignBytes)`; this pads 8x8 8bpp and 8x8/16x8/8x16 4bpp
  frames. A sprite occupies `vramBytes = frames * frameStrideBytes`, and every budget counts these padded bytes.
- The OBJ shape and size follow from `paddedWidth` x `paddedHeight`; the colour mode from the GRF header's
  `gfxAttr` (4 or 8) and the manifest.
- Each sprite uses one 16-colour set (4bpp) or one 256-colour set (8bpp, extended OBJ palettes) on every screen it
  is loaded on. Sprites never share colour sets in 0.1.

## 4. Backgrounds (`bg/<background>.grf`)

Input: `backgrounds/<n>/<file>` (C1 `background.json`). Always 8bpp.

1. Decode, transparency (alpha < 128 only), RGB555 and colour reduction to 255 colours (E407 warning) as for
   sprites (section 3, steps 1-6, with 256-colour palettes).
2. An image wider or taller than `bgMaxSize` (512) is E405.
3. The image is padded with index 0, on the right and at the bottom, to the text-BG size: each dimension becomes 256
   when it is <= 256, else 512. The map therefore always matches one of the four text-BG sizes (256x256, 512x256,
   256x512, 512x512) and the runtime copies it whole.
4. The unique-tile count (8x8 tiles, merging tiles equal up to horizontal and vertical flips, the reduction grit's
   `-mRtf` does) must be <= `bgTilesMax` (1024), else E406. The pipeline counts it itself so the check also runs
   without grit.
5. grit: `grit <bg>.png -gB8 -gt -m -mLs -mRtf -gTFF00FF -ftr -fh! -W1 -o <out>`. Never `-mRtpf` on 8bpp (it
   merges tiles that differ in the upper nibble; claim 5).

The GRF holds the unique tiles, the screen-block map (16-bit entries, `-mLs`) and the 256-colour palette. A
background uses one 256-colour background set on its screen.

## 5. Sounds (`soundbank.bin`)

Input: `sounds/<n>/sound.json` (`kind`, `file`) and the file.

- **Effects** (`kind: "effect"`, `.wav` or `.mp3`): decoded with `@audio/decode-wav` 1.5.0 / `@audio/decode-mp3`
  1.3.1, mixed to mono (each channel rounded to 16 bits, then averaged) and resampled to `min(source rate, 22050)`
  Hz: a box filter `ceil(source / target)` samples wide, then linear interpolation at exact rational positions, in
  integer maths. It is written as 16-bit PCM with only the `fmt `, `data` and `smpl` chunks, in that order (mmutil
  is not RIFF pad-byte aware; claim 9). A loop comes from the source's `smpl` chunk (the first loop, its dwStart
  and dwEnd scaled to the new rate, rounding down); a loop shorter than 16 samples is dropped with the warning E419.
  The file is written as `<name>.wav`.
- **Music** (`kind: "music"`, `.xm`, `.mod`, `.it` or `.s3m`): the file passes through unchanged as
  `<name>.<ext>` (extension lower-cased).
- `.mp3` as music is E408 ("The DS can't play MP3 music. Music must be a tracker file (.xm/.mod/.it/.s3m); pick one
  from the built-in library"). Any other extension, or a file that does not decode, is E409.
- **mmutil** (BlocksDS 1.24.0, the release of the runtime's libmm9; it writes MAS 0x18), run with the build folder
  as cwd (it creates `mm_*_tmp.*` there) and option values attached:

  ```
  mmutil <effect WAVs sorted by name> <music modules sorted by name> -d -o<abs build>/nitrofs/soundbank.bin -h<abs build>/soundbank.h
  ```

  Both outputs are deleted first; a missing output is a failure whatever the exit code (mmutil exits 0 when it
  cannot open the header). A project without sounds gets no `soundbank.bin`.
- **Ids** are always read from `soundbank.h` (`#define SFX_<NAME_UPPER> <n>` and `#define MOD_<NAME_UPPER> <n>`,
  CRLF or LF lines), never from list positions: effect ids share one counter with the samples inside modules.
  Because every effect precedes every module, effect ids are 0..e-1 in name order and music ids 0..m-1 in name
  order; a header that disagrees is reported as E421 (a pipeline or tool fault), never silently used.
- `soundbank.bin` larger than `soundbankMaxBytes` (1 MB) is E410.
- **RAM per sound** (`ramBytes`) is what maxmod allocates when the sound is loaded: for an effect its sample entry
  in the soundbank; for music the module entry plus the sample entries it uses. It is read from `soundbank.bin`
  when it exists, else estimated (section 7, `estimated`): an effect as a 12-byte sample header plus its 16-bit
  data rounded up to 4 bytes, music as the module file's size. One sound above `soundRamBytes` is E411.

## 6. Icon (`icon.png`)

Input: `project.json` `icon` (C1; default `icon.png`). A missing icon file is the warning E418 and no `icon.png` is
written (BuildService then uses the BlocksDS default icon). The image is scaled to fit 32x32 keeping its aspect
ratio (integer area averaging when shrinking, nearest neighbour when growing), centred on a transparent 32x32
canvas, and reduced to 15 colours + transparent (section 3 steps 2-6; reduction is E407). It is written as an
indexed PNG with a 16-entry palette, index 0 magenta and fully transparent (tRNS), as ndstool `-b` requires.

## 7. `assets.manifest.json`

Written as `JSON.stringify(manifest, null, 2)` plus a final LF, with object keys in the order below and assets
sorted by name, so an unchanged project writes identical bytes. `packAssets` writes it without `rooms`;
BuildService rewrites it with `checkRoomBudgets`' result (C4), which adds `rooms`.

```jsonc
{
  "contract": "C3",
  "version": "0.2.0",                      // this contract's version
  "provisional": true,                     // kept while C4's AssetManifest type declares it (see How to change me)
  "tools": { "grit": "1.24.0", "mmutil": "1.24.0" },   // versions used; null when the tool did not run
  "sprites": {
    "spr_bird": {
      "id": 0,                             // position in the name-sorted sprite list
      "file": "gfx/spr_bird.grf",
      "frames": 3,
      "frameWidth": 16, "frameHeight": 16, // as in sprite.json
      "paddedWidth": 16, "paddedHeight": 16,
      "colorMode": "16",                   // "16" (4bpp) or "256" (8bpp), after "auto"
      "colors": 6,                         // palette entries used, including transparent index 0
      "reduced": false,                    // true when colour reduction merged colours (E407)
      "frameBytes": 128, "frameStrideBytes": 128, "vramBytes": 384,
      "origin": { "x": 8, "y": 8 },
      "bbox": { "left": 2, "top": 3, "right": 15, "bottom": 13 }
    }
  },
  "backgrounds": {
    "bg_sky": {
      "id": 0,                             // position in the name-sorted background list
      "file": "bg/bg_sky.grf",
      "width": 256, "height": 192,         // the source image
      "paddedWidth": 256, "paddedHeight": 256,   // the text-BG size
      "colors": 40, "reduced": false,
      "tiles": 120,                        // unique tiles after -mRtf reduction
      "vramBytes": 9728                    // tiles * 64 + map bytes ((paddedWidth/8) * (paddedHeight/8) * 2)
    }
  },
  "sounds": {
    "snd_flap": {
      "id": 0,                             // from soundbank.h
      "kind": "effect",                    // "effect" | "music"
      "define": "SFX_SND_FLAP",            // or "MOD_<NAME_UPPER>"
      "sampleRate": 22050, "samples": 4410,          // effects; null for music
      "loop": null,                        // effects: {"start": n, "end": n} in samples, or null
      "ramBytes": 8840,
      "estimated": false                   // true when ramBytes was not read from soundbank.bin
    }
  },
  "soundbank": { "file": "soundbank.bin", "bytes": 26520 },   // null when the project has no sounds
  "icon": { "file": "icon.png", "colors": 9, "reduced": false },   // null when there is no icon
  "budgets": {                             // the C13 limits the figures were checked against
    "objVramBytesPerScreen": 131072, "objVramAlignBytes": 128,
    "obj16PalettesPerScreen": 16, "obj256PalettesPerScreen": 16,
    "bg256PaletteSlotsPerScreen": 4, "bgTilesMax": 1024, "bgMaxSize": 512,
    "soundRamBytes": 786432, "soundbankMaxBytes": 1048576
  },
  "rooms": {                               // added by checkRoomBudgets, in project.json room order
    "rm_game": {
      "top":    { "objVramBytes": 1152, "obj16Palettes": 2, "obj256Palettes": 1, "bgPalettes": 0, "bgVramBytes": 0 },
      "bottom": { "objVramBytes": 0, "obj16Palettes": 0, "obj256Palettes": 0, "bgPalettes": 0, "bgVramBytes": 0 },
      "soundRamBytes": 26520
    }
  }
}
```

Fields are never omitted: an unknown value is `null`. A superset of C4's provisional `AssetManifest` (`provisional`,
`sprites` id/frames/frameWidth/frameHeight/colorMode, `backgrounds` id/width/height, `sounds` id/kind), so every
current consumer keeps working.

**Without tools** (a cloud session, or `compileOnly` before the first build): `packAssets` still converts, checks
and writes the manifest, with `tools` null, sound `id`s in name order (the rule above), `ramBytes` estimated and
`soundbank` null; it reports E6xx for the missing tools as C4 requires and writes no GRF or soundbank.

## 8. Cache

`cache/<sha256>/` holds one converted asset: its GRF (or WAV, or module copy) plus `meta.json` with the asset's
manifest entry. The key is the SHA-256 of the asset kind, the source file bytes, the JSON settings the conversion
reads, this contract's version, the pipeline's own version and the tool version (grit for images, none for sound
conversion, since mmutil always runs over the whole set). The soundbank is keyed by the keys of all its inputs in
order plus the mmutil version. A hit is copied into `nitrofs/`; nothing else is recomputed, so a second run on an
unchanged project costs only hashing and copying (PLAN target: < 50 ms on the samples). Deleting `cache/` is always
safe.

## 9. Per-room asset sets and budgets

A room's asset set is defined by the compiler (PLAN.md 3.2, C2 ROOM): per screen, the room's backgrounds and the
sprites of the objects placed there, of objects reachable through `instance_create`, and of `sprite_index` /
`draw_sprite` uses; `draw_set_screen` adds the other screen; plus the sounds and music loaded before Room Start.
C4's `RoomAssetSet` carries it. `checkRoomBudgets(manifest, roomSets)` totals, per room and screen:

| Figure | Sum over the screen's set | Limit (C13) | Over the limit |
|---|---|---|---|
| `objVramBytes` | sprite `vramBytes` | `objVramBytesPerScreen` | E413 |
| `obj16Palettes` | 16-colour sprites | `obj16PalettesPerScreen` | E414 |
| `obj256Palettes` | 256-colour sprites | `obj256PalettesPerScreen` | E415 |
| `bgPalettes` | backgrounds | `bg256PaletteSlotsPerScreen` | E416 |
| `bgVramBytes` | background `vramBytes` | reported only (no C13 key yet) | - |
| `soundRamBytes` (per room) | sound `ramBytes` | `soundRamBytes` | E417 |

A sprite used on both screens counts on both. Budget diagnostics point at `rooms/<room>/room.json` and name the
biggest contributors, e.g. "rm_game needs 18 colour sets on the top screen, but the DS has 16. Reduce spr_a or
spr_b to 16 colours." A name in a room set that the manifest lacks is ignored here (the compiler reports it).

## 10. Limits and codes

The E4xx catalog (`packages/asset-pipeline/src/diagnostics/catalog.ts`; E490-E499 belong to the compiler) holds the
exact wording. Every limit message names the asset, the limit and a fix (C9 style: no banned words, say "sprite
memory" and "colour sets").

| Code | Severity | When |
|---|---|---|
| E401 | error | a sprite frame larger than 64x64 ("spr_boss is 100x100. DS sprites can be at most 64x64. Shrink it, or make it a Background.") |
| E402 | error | a sheet whose size does not match `frames` x `frameWidth` x `frameHeight` |
| E403 | error | an asset file is missing |
| E404 | error | an image that is not a readable PNG |
| E405 | error | a background larger than 512x512 |
| E406 | error | a background with more than 1024 unique tiles |
| E407 | warning | colours were merged to fit 15 or 255 (sprite, background or icon) |
| E408 | error | MP3 as music |
| E409 | error | an unsupported or unreadable sound file |
| E410 | error | `soundbank.bin` larger than 1 MB |
| E411 | error | one sound needs more than `soundRamBytes` |
| E412 | error | two names of one kind differ only in letter case |
| E413-E417 | error | the per-room budgets of section 9 |
| E418 | warning | the project icon is missing |
| E419 | warning | a sound loop shorter than 16 samples was dropped |
| E420 | error | a name that is not NitroFS/mmutil-safe (defensive; C1 names always pass) |
| E421 | error | `soundbank.h` disagrees with the expected ids, or mmutil wrote no output |
| E422 | error | grit failed or wrote no GRF |

New codes are added in the catalog with a CHANGELOG line (T0 under C9's rules) and listed here by T1.

## How to change me

- **T0** (wording, examples, clarifications that change no byte and no field): WS5 commits with a
  `contracts/CHANGELOG.md` line.
- **T1** (additive: a new manifest field, a new optional file, a new code, a new budget figure): minor version bump,
  updated fixtures and a CHANGELOG entry in one commit; WS0 reviews within 24 hours.
- **T2** (anything that changes a file the runtime reads, a byte layout, an existing field, a command line or the
  id rules): an ADR co-signed by WS2, WS3, WS4 and WS6, merged by WS0.
- C4's `AssetManifest` and `RoomAssetSet` in `packages/toolchain/src/api.ts` (WS1/WS8) are expected to adopt this
  schema by a C4 T1; `provisional` is dropped from the manifest in the same change (a C3 T1).
