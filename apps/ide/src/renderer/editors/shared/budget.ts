/**
 * Shared by the editors' live meters: the project's last C3 `assets.manifest.json` (re-read after every build) and
 * each sprite's cost inputs with its colour mode resolved. Not an editor module (no index.ts), so the shell does not
 * load it as one.
 */
import type { SpriteCostInput } from "@dsdude/editor-core";
import type { ManifestSummary } from "@dsdude/ipc-contract";
import type { Project } from "@dsdude/project-format";
import { useEffect, useState } from "react";
import type { PanelHost } from "../../panels/api.ts";

/** The manifest's sprite entry (C3 SpriteEntry), as far as the meters use it. */
interface ManifestSprite {
  frames?: number;
  frameWidth?: number;
  frameHeight?: number;
  colorMode?: "16" | "256";
  vramBytes?: number;
}

/** Phases after which the build folder holds a new manifest. */
const AFTER_BUILD = new Set(["running", "done", "failed"]);

/** The last build's manifest, or null before the first build (re-read when a build ends). */
export function useManifest(host: PanelHost): ManifestSummary | null {
  const [manifest, setManifest] = useState<ManifestSummary | null>(null);
  useEffect(() => {
    const projectDir = host.project.dir();
    if (!projectDir) return;
    let live = true;
    const load = () =>
      host.ipc
        .invoke("build.manifest", { projectDir })
        .then((r) => {
          if (live) setManifest(r.manifest);
        })
        .catch(() => undefined);
    void load();
    const off = host.ipc.on("build.progress", (e) => {
      if (AFTER_BUILD.has(e.phase)) void load();
    });
    return () => {
      live = false;
      off();
    };
  }, [host]);
  return manifest;
}

export function manifestSprite(manifest: ManifestSummary | null, name: string): ManifestSprite | null {
  const sprites = (manifest as { sprites?: Record<string, ManifestSprite> } | null)?.sprites;
  return sprites?.[name] ?? null;
}

/**
 * Cost inputs of every sprite: colour mode "16"/"256" as set, else as the last build made it, else as the editor
 * worked it out from the picture (`modes`), else 256 colours (the larger). The manifest's memory figure is used only
 * while the geometry still matches it.
 */
export function spriteCosts(
  project: Project,
  manifest: ManifestSummary | null,
  modes: ReadonlyMap<string, "16" | "256"> = new Map(),
): Map<string, SpriteCostInput> {
  const out = new Map<string, SpriteCostInput>();
  for (const s of project.sprites) {
    const built = manifestSprite(manifest, s.name);
    const colorMode = s.colorMode !== "auto" ? s.colorMode : (built?.colorMode ?? modes.get(s.name) ?? "256");
    const same =
      built?.frames === s.frames &&
      built.frameWidth === s.frameWidth &&
      built.frameHeight === s.frameHeight &&
      built.colorMode === colorMode;
    out.set(s.name, {
      frames: s.frames,
      frameWidth: s.frameWidth,
      frameHeight: s.frameHeight,
      colorMode,
      ...(same && built?.vramBytes !== undefined ? { vramBytes: built.vramBytes } : {}),
    });
  }
  return out;
}

/** Bytes as KB with one decimal under 10 KB. */
export function kb(bytes: number): string {
  const k = bytes / 1024;
  return `${k < 10 && k % 1 !== 0 ? k.toFixed(1) : Math.round(k)} KB`;
}
