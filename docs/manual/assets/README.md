# How DSDude turns your art and sounds into a DS game

When you press Play, DSDude converts every sprite, background, sound and the game icon into files the DS can load.
This page explains what happens to them, which limits the DS has, and what to do when DSDude reports a problem.
The exact rules for tool builders are in `contracts/assetpack.md` (C3).

The conversion is quick: DSDude remembers every file it has already converted, so only the ones you changed are
converted again.

## Sprites

A sprite is a strip of frames side by side in `sheet.png`. DSDude:

1. **Finds the see-through pixels.** Pixels that are mostly transparent (alpha below half) are see-through. If you
   picked a colour in the sprite editor (for example the top-left pixel's colour), that colour is see-through too.
   If your image has no transparent pixels at all, magenta (`#ff00ff`) is see-through.
2. **Turns colours into DS colours.** The DS has 32 shades per red, green and blue, so very similar colours can
   become the same colour.
3. **Picks 16 or 256 colours.** With **Auto**, a sprite with at most 15 colours (plus see-through) uses a
   16-colour set, which is cheaper. Otherwise it uses a 256-colour set (up to 255 colours plus see-through).
4. **Merges colours if there are too many.** DSDude picks the best 15 or 255 colours and uses the nearest one for
   every pixel. This is only a warning (E407): the import dialog shows you the result next to the original.
5. **Pads each frame to a DS sprite size.** The DS draws sprites in 12 sizes: 8x8, 16x8, 8x16, 16x16, 32x8, 8x32,
   32x16, 16x32, 32x32, 64x32, 32x64 and 64x64. Each frame is padded with see-through pixels on the right and at
   the bottom to the smallest size that fits. A 24x24 frame becomes 32x32; the flappy gap sprite (8x48) becomes
   32x64. Your origin and collision box do not move.

**Tips**
- Frames can be at most 64x64. Bigger pictures should be backgrounds.
- Sizes that are exactly a DS size waste no sprite memory. A 33x33 frame costs as much as 64x64.
- Fewer colours means a cheaper sprite: a 16-colour 16x16 frame uses half the memory of a 256-colour one.

## Backgrounds

A background can be up to 512x512 pixels. DSDude cuts it into 8x8 squares and keeps each different square once
(a square and its mirror image count as one). A background may have at most 1024 different squares, so pictures
with repeating parts (sky, bricks, grass) fit easily, while photos may not. Backgrounds use up to 255 colours;
see-through pixels show the colour behind.

## Sounds

- **Effects** are `.wav` or `.mp3` files. DSDude makes them mono and at most 22050 samples per second, which is what
  the DS plays well. A loop saved in the WAV (a `smpl` loop) is kept if it is at least 16 samples long.
- **Music** must be a tracker file: `.xm`, `.mod`, `.it` or `.s3m`. These are tiny and sound great on the DS. MP3
  music is not possible (E408); pick a track from the built-in library instead, or use the MP3 as an effect.
- Every sound in a room is loaded into the DS's sound memory when the room starts. The status bar shows how full it
  is.

## The game icon

`icon.png` (set in Game Settings) is shrunk or grown to fit 32x32 and reduced to 15 colours plus see-through. If
there is no icon, the game gets the standard one (a warning, E418).

## Limits per room

The DS has a fixed amount of memory for each screen. DSDude adds up what each room needs, on each screen:

| What | Limit per screen | If a room needs more |
|---|---|---|
| Sprite memory (all frames of every sprite on that screen) | 128 KB | E413: use fewer or smaller sprites |
| 16-colour sets (one per 16-colour sprite) | 16 | E414: use fewer different sprites |
| 256-colour sets (one per 256-colour sprite) | 16 | E415: reduce some sprites to 16 colours |
| Backgrounds | 4 | E416: use fewer backgrounds |
| Sound memory (per room, both screens) | 768 KB | E417: use fewer or shorter sounds |

A sprite used on both screens counts on both. The numbers come from `contracts/runtime-limits.json`.

## Problems DSDude can report

| Code | What it means | What to do |
|---|---|---|
| E401 | A sprite frame is bigger than 64x64. | Shrink it, or make it a background. |
| E402 | The sheet's size does not match the number of frames and the frame size. | Fix the frame count or size in the sprite editor. |
| E403 | A file the project needs is missing. | Put it back, or import the asset again. |
| E404 | An image is not a readable PNG. | Save it again as PNG. |
| E405 | A background is bigger than 512x512. | Shrink or split it. |
| E406 | A background has more than 1024 different 8x8 squares. | Use more repeated parts or fewer colours. |
| E407 (warning) | Colours were merged to fit 15 or 255. | Check the preview; draw with fewer colours if it looks wrong. |
| E408 | MP3 used as music. | Use a tracker file, or make the sound an effect. |
| E409 | A sound file can't be read. | Use .wav/.mp3 for effects and .xm/.mod/.it/.s3m for music. |
| E410 | All sounds together are bigger than 1 MB. | Shorten or remove some sounds. |
| E411 | One sound is too big for a room's sound memory. | Shorten it. |
| E412 | Two names differ only in capital letters (`spr_Hero` and `spr_hero`). | Rename one. |
| E413-E417 | A room needs more than the DS has (see the table above). | Follow the hint in the message. |
| E418 (warning) | The game icon is missing. | Add one in Game Settings. |
| E419 (warning) | A sound loop was shorter than 16 samples and was removed. | Make the loop longer. |
| E420 | A name can't be used as a DS file name. | Use only letters, digits and `_`. |
| E421, E422 | The sound or image converter failed. | Build again; if it keeps happening, run `dsdude doctor`. |

Warnings never stop your game from playing; errors do.
