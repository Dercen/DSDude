/**
 * The assets.manifest.json schema (C3 section 7). A superset of C4's provisional `AssetManifest`, so the manifest
 * `packAssets` returns satisfies `PackAssetsFn` and every current consumer keeps working. Pure TypeScript.
 */
import type { AssetManifest } from "@dsdude/toolchain";
import type { AssetLimits } from "./limits.ts";

/** This contract's version (contracts/assetpack.md line 3). */
export const ASSETPACK_CONTRACT_VERSION = "0.1.0";

export interface SpriteEntry {
  id: number;
  file: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  paddedWidth: number;
  paddedHeight: number;
  colorMode: "16" | "256";
  colors: number;
  reduced: boolean;
  frameBytes: number;
  frameStrideBytes: number;
  vramBytes: number;
  origin: { x: number; y: number };
  bbox: { left: number; top: number; right: number; bottom: number };
}

export interface BackgroundEntry {
  id: number;
  file: string;
  width: number;
  height: number;
  paddedWidth: number;
  paddedHeight: number;
  colors: number;
  reduced: boolean;
  tiles: number;
  vramBytes: number;
}

export interface SoundEntry {
  id: number;
  kind: "effect" | "music";
  define: string;
  sampleRate: number | null;
  samples: number | null;
  loop: { start: number; end: number } | null;
  ramBytes: number;
  estimated: boolean;
}

/** Per-screen figures of one room (C3 section 9). */
export interface ScreenFigures {
  objVramBytes: number;
  obj16Palettes: number;
  obj256Palettes: number;
  bgPalettes: number;
  bgVramBytes: number;
}

export interface RoomFigures {
  top: ScreenFigures;
  bottom: ScreenFigures;
  soundRamBytes: number;
}

/** The C13 limits a manifest was checked against (C3 section 7 `budgets`). */
export type ManifestBudgets = Pick<
  AssetLimits,
  | "objVramBytesPerScreen"
  | "objVramAlignBytes"
  | "obj16PalettesPerScreen"
  | "obj256PalettesPerScreen"
  | "bg256PaletteSlotsPerScreen"
  | "bgTilesMax"
  | "bgMaxSize"
  | "soundRamBytes"
  | "soundbankMaxBytes"
>;

/** assets.manifest.json. Key order here is the file's key order. */
export interface AssetPackManifest extends AssetManifest {
  contract: "C3";
  version: string;
  provisional: true;
  tools: { grit: string | null; mmutil: string | null };
  sprites: Record<string, SpriteEntry>;
  backgrounds: Record<string, BackgroundEntry>;
  sounds: Record<string, SoundEntry>;
  soundbank: { file: string; bytes: number } | null;
  icon: { file: string; colors: number; reduced: boolean } | null;
  budgets: ManifestBudgets;
  /** Added by checkRoomBudgets; absent in the manifest packAssets writes. */
  rooms?: Record<string, RoomFigures>;
}

/** Serialises a manifest as C3 requires: two-space JSON plus a final LF. */
export function serializeManifest(manifest: AssetManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
