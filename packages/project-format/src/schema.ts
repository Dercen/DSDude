/**
 * Contract C1 v0.1.0: the on-disk project format as zod schemas. Spec: contracts/project-format.md.
 * How to change me: T0 for comments; T1 (minor bump + CHANGELOG) for a new optional field with a default;
 * T2 (ADR + migration in src/migrate.ts) for anything a v0 project would fail. Owner: WS0.
 */
import { z } from "zod";

export const PROJECT_CONTRACT_VERSION = "0.1.0";
/** `formatVersion` written by this package. v0 is the first format; migrations start after it. */
export const FORMAT_VERSION = 0;

/** Asset, object, room and script names are DSS identifiers: ASCII, <= 63 chars, no '.'. */
export const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
export const NameSchema = z.string().regex(NAME, "a name uses letters, digits and _ and starts with a letter or _");

export const ScreenSchema = z.enum(["top", "bottom"]);
export type Screen = z.infer<typeof ScreenSchema>;

const Int = z.int();
const NonNeg = z.int().min(0);
const Pos = z.int().min(1);

/** project.json */
export const ProjectJsonSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  name: NameSchema,
  title: z.string().min(1).max(127),
  subtitle: z.string().max(127).default(""),
  author: z.string().max(127).default(""),
  /** Fixed to "####" in 0.1 (homebrew game code; hidden in Game Settings). */
  gamecode: z.literal("####").default("####"),
  /** Project-relative PNG; the pipeline quantises it to 32x32 with <= 15 colours + transparent. */
  icon: z.string().default("icon.png"),
  firstRoom: NameSchema,
  /** Room order for room_goto_next/previous. Every room folder appears exactly once. */
  rooms: z.array(NameSchema).min(1),
});
export type ProjectJson = z.infer<typeof ProjectJsonSchema>;

export const ColorModeSchema = z.enum(["auto", "16", "256"]);
export type ColorMode = z.infer<typeof ColorModeSchema>;

/** sprites/<name>/sprite.json; the image is sprites/<name>/sheet.png, a horizontal strip of frames. */
export const SpriteJsonSchema = z.object({
  frames: Pos,
  frameWidth: Pos,
  frameHeight: Pos,
  origin: z.object({ x: Int, y: Int }),
  /** Inclusive pixel bounds inside one frame, used for collisions. */
  bbox: z.object({ left: NonNeg, top: NonNeg, right: NonNeg, bottom: NonNeg }),
  colorMode: ColorModeSchema.default("auto"),
  /** "alpha" uses the PNG alpha channel; a "#rrggbb" colour marks that colour transparent. */
  transparent: z.union([z.literal("alpha"), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).default("alpha"),
});
export type SpriteJson = z.infer<typeof SpriteJsonSchema>;

/** backgrounds/<name>/background.json; the image is backgrounds/<name>/<file>. */
export const BackgroundJsonSchema = z.object({
  file: z.string().default("background.png"),
});
export type BackgroundJson = z.infer<typeof BackgroundJsonSchema>;

/** sounds/<name>/sound.json; the source is sounds/<name>/<file>: wav/mp3 effects, xm/mod/it/s3m music. */
export const SoundJsonSchema = z.object({
  kind: z.enum(["effect", "music"]),
  file: z.string().regex(/\.(wav|mp3|xm|mod|it|s3m)$/i, "a sound file is .wav, .mp3, .xm, .mod, .it or .s3m"),
});
export type SoundJson = z.infer<typeof SoundJsonSchema>;

/** objects/<name>/object.json; events are objects/<name>/<event>.dss, helpers objects/<name>/functions.dss. */
export const ObjectJsonSchema = z.object({
  sprite: NameSchema.nullable().default(null),
  parent: NameSchema.nullable().default(null),
  visible: z.boolean().default(true),
  depth: Int.default(0),
  screen: ScreenSchema.default("top"),
});
export type ObjectJson = z.infer<typeof ObjectJsonSchema>;

export const RoomScreenSchema = z.object({
  background: NameSchema.nullable().default(null),
  viewX: Int.default(0),
  viewY: Int.default(0),
});
export type RoomScreen = z.infer<typeof RoomScreenSchema>;

export const RoomInstanceSchema = z.object({
  object: NameSchema,
  x: Int,
  y: Int,
  /** Defaults to the object's screen. */
  screen: ScreenSchema.optional(),
  /** DSS run after the instance's Create event. */
  creationCode: z.string().optional(),
});
export type RoomInstance = z.infer<typeof RoomInstanceSchema>;

/** rooms/<name>/room.json */
export const RoomJsonSchema = z.object({
  width: Pos,
  height: Pos,
  /** "separate" is the only 0.1 value; "stacked" is reserved for v1.1. */
  layout: z.literal("separate").default("separate"),
  screens: z
    .object({
      top: RoomScreenSchema.default({ background: null, viewX: 0, viewY: 0 }),
      bottom: RoomScreenSchema.default({ background: null, viewX: 0, viewY: 0 }),
    })
    .default({
      top: { background: null, viewX: 0, viewY: 0 },
      bottom: { background: null, viewX: 0, viewY: 0 },
    }),
  instances: z.array(RoomInstanceSchema).default([]),
});
export type RoomJson = z.infer<typeof RoomJsonSchema>;
