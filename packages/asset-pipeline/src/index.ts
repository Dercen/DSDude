/**
 * @dsdude/asset-pipeline (WS5): turns a project's sprites, backgrounds, sounds and icon into the NitroFS asset pack
 * and assets.manifest.json (C3, contracts/assetpack.md), and provides the C12 preview API. Read
 * packages/asset-pipeline/CLAUDE.md first.
 *
 * The root adds the Node-only entry points (packAssets, cliCommands: fs and child_process) to the pure API of
 * `@dsdude/asset-pipeline/browser`, which browser code should import instead.
 */
export * from "./browser.ts";
export { type AssetsCommandOptions, type AssetsIo, cliCommands, makeAssetsCommand } from "./cli.ts";
export { MANIFEST_JSON, type PackOptions, packAssets } from "./pack/pack.ts";
export type { ToolRun, ToolRunner, ToolRunOptions } from "./pack/tools.ts";

export const packageName = "@dsdude/asset-pipeline";
