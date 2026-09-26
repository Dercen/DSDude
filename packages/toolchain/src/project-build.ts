/** Helpers for building DSDude projects (project.json) in LocalBuildService. No tools, no spawns. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Project } from "@dsdude/project-format";
import type { AssetManifest } from "./api.ts";

export const MANIFEST_JSON = "assets.manifest.json";
export const DSDB_NAME = "game.dsdb";
/** C2 header: u32 little-endian RNG seed at offset 12; 0 lets the runtime pick. */
export const DSDB_SEED_OFFSET = 12;
const DSDB_HEADER_SIZE = 32;

/**
 * A manifest built from the project files alone, for compileOnly when no build has run yet (no tools needed).
 * PROVISIONAL, like AssetManifest until C3: ids follow the name-sorted resource lists, sprite geometry comes
 * from sprite.json, and background sizes are 0 because they need the PNG. packAssets' manifest replaces it.
 */
export function provisionalManifest(project: Project): AssetManifest {
  const manifest: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };
  for (const [id, s] of project.sprites.entries()) {
    manifest.sprites[s.name] = {
      id,
      frames: s.frames,
      frameWidth: s.frameWidth,
      frameHeight: s.frameHeight,
      colorMode: s.colorMode === "16" ? "16" : "256",
    };
  }
  for (const [id, b] of project.backgrounds.entries()) manifest.backgrounds[b.name] = { id, width: 0, height: 0 };
  for (const [id, s] of project.sounds.entries()) manifest.sounds[s.name] = { id, kind: s.kind };
  return manifest;
}

/** A copy of `dsdb` with the header's RNG seed set (C2). Returns the input unchanged when it has no header. */
export function withDsdbSeed(dsdb: Uint8Array, seed: number): Uint8Array {
  if (dsdb.length < DSDB_HEADER_SIZE) return dsdb;
  const out = new Uint8Array(dsdb);
  new DataView(out.buffer).setUint32(DSDB_SEED_OFFSET, seed >>> 0, true);
  return out;
}

/** Reads <build>\assets.manifest.json; null when it is missing or unreadable. */
export function readManifest(file: string): AssetManifest | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AssetManifest;
  } catch {
    return null;
  }
}

export function writeManifest(file: string, manifest: AssetManifest): void {
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
