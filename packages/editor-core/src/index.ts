/**
 * @dsdude/editor-core: the pure cores of DSDude's visual editors (sprite, room, background, sound). No DOM, no
 * Node: views in apps/ide/src/renderer/editors/ render them, and node Vitest covers every core.
 */
export * from "./color.ts";
export * from "./history.ts";
export * from "./pixels.ts";
export * from "./sprite.ts";

export const packageName = "@dsdude/editor-core";
