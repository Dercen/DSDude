/**
 * @dsdude/asset-pipeline (WS5): turns a project's sprites, backgrounds, sounds and icon into the NitroFS asset pack
 * and assets.manifest.json (C3, contracts/assetpack.md), and provides the C12 preview API. Read
 * packages/asset-pipeline/CLAUDE.md first.
 *
 * Everything exported here except the pack/CLI entry points is pure TypeScript (no Node imports), so the IDE
 * renderer can import the preview and conversion functions.
 */
export type { AssetCode } from "./diagnostics/catalog.ts";
export { ASSET_CATALOG } from "./diagnostics/catalog.ts";
export type { ConvertedBackground } from "./image/background.ts";
export { convertBackground } from "./image/background.ts";
export type { ConvertedIcon } from "./image/icon.ts";
export { convertIcon } from "./image/icon.ts";
export { OBJ_SIZES, objSizeFor } from "./image/objsize.ts";
export type { RgbaImage } from "./image/png.ts";
export { decodePng, encodeDsIndexedPng, PngError } from "./image/png.ts";
export type { Dither } from "./image/quantize.ts";
export type { ConvertedSprite, SpriteDefaults, SpriteSettings } from "./image/sprite.ts";
export { convertSprite, spriteDefaults } from "./image/sprite.ts";
export type { AssetLimits } from "./limits.ts";
export { LIMITS } from "./limits.ts";
export type {
  PreviewFrame,
  PreviewSpriteFn,
  PreviewSpriteOptions,
  SpritePreview,
} from "./preview.ts";
export { PREVIEW_CONTRACT_VERSION } from "./preview.ts";
export type { PreviewDetailsOptions, SpritePreviewDetails } from "./preview-sprite.ts";
export { previewSprite, previewSpriteDetails, renderIndices } from "./preview-sprite.ts";
export type { Problem } from "./problems.ts";

export const packageName = "@dsdude/asset-pipeline";
