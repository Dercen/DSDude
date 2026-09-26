/**
 * `@dsdude/asset-pipeline/browser`: the pure part of the package (preview API, conversions, catalog, limits,
 * manifest types, room budgets). No Node imports anywhere below it, so the IDE renderer, WS6b's editors and
 * browser tests can import it without a bundler shim. The package root adds the Node-only packAssets and CLI.
 */
export { checkRoomBudgets, nameList, spriteVramBytes } from "./budgets.ts";
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
  AssetPackManifest,
  BackgroundEntry,
  ManifestBudgets,
  RoomFigures,
  ScreenFigures,
  SoundEntry,
  SpriteEntry,
} from "./manifest.ts";
export { ASSETPACK_CONTRACT_VERSION, serializeManifest } from "./manifest.ts";
export type { PreviewFrame, PreviewSpriteFn, PreviewSpriteOptions, SpritePreview } from "./preview.ts";
export { PREVIEW_CONTRACT_VERSION } from "./preview.ts";
export type { PreviewDetailsOptions, SpritePreviewDetails } from "./preview-sprite.ts";
export { previewSprite, previewSpriteDetails, renderIndices } from "./preview-sprite.ts";
export type { Problem } from "./problems.ts";
