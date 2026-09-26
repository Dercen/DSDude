/**
 * The asset pipeline's diagnostics catalog (contract C9, contracts/diagnostics.md). Owner: WS5.
 *
 * Range owned here: E4xx hardware and asset limits, except E490-E499 (the compiler's). The codes and when they fire
 * are listed in contracts/assetpack.md section 10. `tools/gen-docs` (WS7) renders every entry into
 * docs/reference/errors.md, so each entry carries a short `title`.
 *
 * Style rules (contracts/diagnostics.md): the message says what happened, the hint says what to do, `file` says
 * where. Every limit message names the asset, the limit and a fix. Write for a 12-year-old. Banned words in messages
 * and hints: instruction, token, identifier, operand, arity, expression, opcode, VRAM, OAM, palette slot (a unit
 * test enforces the list); say "sprite memory" and "colour sets". Colour reduction is always a warning.
 *
 * Placeholders: `{name}` is the asset (or room) name; the others are filled by the producer of each problem.
 * Adding an entry is a T0 change (a contracts/CHANGELOG.md line) plus a T1 listing in contracts/assetpack.md.
 */
import type { CatalogEntry, Severity } from "@dsdude/project-format";

/** Builds one catalog entry; the helpers keep each entry on a few lines below. */
const entry =
  (severity: Severity) =>
  (code: string, title: string, message: string, hint: string | null): CatalogEntry => ({
    code,
    severity,
    title,
    message,
    hint,
  });
/** An entry that blocks Play. */
const error = entry("error");
/** An entry that does not block Play (colour reduction, a missing icon, a dropped loop). */
const warning = entry("warning");

/** Hint shared by the entries that mean a tool or pipeline fault rather than a project mistake. */
const TOOL_FAULT_HINT = "Build again. If it keeps happening, run dsdude doctor and report the problem.";

export const ASSET_CATALOG = {
  E401: error(
    "E401",
    "Sprite too big",
    "{name} is {width}x{height}. DS sprites can be at most {max}x{max}.",
    "Shrink it, or make it a Background.",
  ),
  E402: error(
    "E402",
    "Sprite sheet does not match its frames",
    "{name}'s sheet is {width}x{height}, but {frames} frames of {frameWidth}x{frameHeight} need {wantWidth}x{frameHeight}.",
    "Change the number of frames or the frame size in the sprite editor, or import the image again.",
  ),
  E403: error(
    "E403",
    "Asset file missing",
    "{name} needs {file}, but the file is missing.",
    "Put the file back, or import the {kind} again.",
  ),
  E404: error(
    "E404",
    "Image can't be read",
    "{name}: {file} is not a PNG image DSDude can read ({detail}).",
    "Open it in an image editor and save it again as PNG.",
  ),
  E405: error(
    "E405",
    "Background too big",
    "{name} is {width}x{height}. DS backgrounds can be at most {max}x{max}.",
    "Shrink it, or split it into smaller backgrounds.",
  ),
  E406: error(
    "E406",
    "Background has too many different squares",
    "{name} has {tiles} different 8x8 squares, but a DS background can have at most {max}.",
    "Repeat more parts of the picture, use fewer colours, or make it smaller.",
  ),
  E407: warning(
    "E407",
    "Colours merged",
    "{name} has {from} colours, but it can use {to} here, so DSDude merged similar colours.",
    "Check the preview in the import dialog. If it looks wrong, draw the image with fewer colours.",
  ),
  E408: error(
    "E408",
    "MP3 music",
    "{name} is MP3 music. The DS can't play MP3 music. Music must be a tracker file (.xm/.mod/.it/.s3m).",
    "Pick one from the built-in library, or make this sound an effect.",
  ),
  E409: error(
    "E409",
    "Sound can't be read",
    "{name}: DSDude can't read {file} as a sound ({detail}).",
    "Use a .wav or .mp3 file for an effect, or a .xm, .mod, .it or .s3m file for music.",
  ),
  E410: error(
    "E410",
    "Too much sound",
    "All sounds together take {bytes} bytes, but a DS game can hold at most {max}.",
    "Shorten or remove some sounds. The biggest are {list}.",
  ),
  E411: error(
    "E411",
    "Sound too long",
    "{name} needs {bytes} bytes of sound memory, but a room can use at most {max}.",
    "Shorten it.",
  ),
  E412: error(
    "E412",
    "Names differ only in capital letters",
    "{name} and {other} differ only in capital letters, and the DS can't tell them apart.",
    "Rename one of them.",
  ),
  E413: error(
    "E413",
    "Room needs too much sprite memory",
    "{name} needs {bytes} bytes of sprite memory on the {screen} screen, but the DS has {max}.",
    "Use fewer or smaller sprites on that screen. The biggest are {list}.",
  ),
  E414: error(
    "E414",
    "Room needs too many 16-colour sets",
    "{name} needs {count} colour sets for 16-colour sprites on the {screen} screen, but the DS has {max}.",
    "Use fewer different sprites on that screen, for example {list}.",
  ),
  E415: error(
    "E415",
    "Room needs too many colour sets",
    "{name} needs {count} colour sets on the {screen} screen, but the DS has {max}.",
    "Reduce {list} to 16 colours.",
  ),
  E416: error(
    "E416",
    "Room uses too many backgrounds",
    "{name} uses {count} backgrounds on the {screen} screen, but the DS can show {max}.",
    "Use fewer backgrounds on that screen: {list}.",
  ),
  E417: error(
    "E417",
    "Room needs too much sound memory",
    "{name} needs {bytes} bytes of sound memory, but the DS has {max}.",
    "Use fewer or shorter sounds in this room. The biggest are {list}.",
  ),
  E418: warning(
    "E418",
    "Game icon missing",
    "The game icon {file} is missing, so the game gets the standard icon.",
    "Add an icon in Game Settings.",
  ),
  E419: warning(
    "E419",
    "Sound loop too short",
    "{name}'s loop is {length} samples long, but the DS needs at least {min}, so the loop was dropped.",
    "Make the loop longer in a sound editor, or remove it.",
  ),
  E420: error(
    "E420",
    "Name can't be a DS file name",
    "The name {name} can't be used as a file name on the DS.",
    "Rename it using only letters, digits and _ (at most 63 characters).",
  ),
  E421: error("E421", "Sound converter failed", "The sound converter did not finish: {detail}.", TOOL_FAULT_HINT),
  E422: error("E422", "Image converter failed", "The image converter failed on {name}: {detail}.", TOOL_FAULT_HINT),
} as const satisfies Record<string, CatalogEntry>;

/** Every code in this catalog. */
export type AssetCode = keyof typeof ASSET_CATALOG;
