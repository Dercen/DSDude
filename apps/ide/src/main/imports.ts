/**
 * Importing a picked file as a new resource (C5 assets.import): the file is copied into its resource folder and the
 * resource JSON written through C1's schemas. Names are unique across every resource kind (C1 names are global).
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { decodePng } from "@dsdude/asset-pipeline/browser";
import {
  BackgroundJsonSchema,
  type SoundJson,
  SoundJsonSchema,
  type SpriteJson,
  SpriteJsonSchema,
  toJsonText,
} from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";

export interface ImportRequest {
  projectDir: string;
  kind: "sprite" | "background" | "sound";
  sourcePath: string;
  name: string;
  sprite?: SpriteJson;
  sound?: { kind: "effect" | "music" };
}

const MUSIC = new Set([".xm", ".mod", ".it", ".s3m"]);
const SOUND = new Set([".wav", ".mp3", ...MUSIC]);

/** Every resource name in the project (sprites, backgrounds, sounds, objects, rooms, scripts). */
async function namesIn(projectDir: string): Promise<Set<string>> {
  const { project } = await loadProject(projectDir);
  if (!project) throw new Error("this folder is not a DSDude project");
  return new Set(
    [project.sprites, project.backgrounds, project.sounds, project.objects, project.rooms, project.scripts].flatMap(
      (list) => list.map((r) => r.name),
    ),
  );
}

/** The sprite.json of a whole-image, one-frame import (origin at the centre, bbox the whole frame). */
export function oneFrameSprite(width: number, height: number): SpriteJson {
  return SpriteJsonSchema.parse({
    frames: 1,
    frameWidth: width,
    frameHeight: height,
    origin: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    bbox: { left: 0, top: 0, right: width - 1, bottom: height - 1 },
  });
}

export async function importAsset(req: ImportRequest): Promise<{ name: string }> {
  if ((await namesIn(req.projectDir)).has(req.name))
    throw new Error(`something in this project is already called ${req.name}`);
  const ext = extname(req.sourcePath).toLowerCase();
  const folder = join(req.projectDir, `${req.kind}s`, req.name);
  if (existsSync(folder)) throw new Error(`${req.kind}s/${req.name} already exists`);

  if (req.kind === "sprite" || req.kind === "background") {
    if (ext !== ".png") throw new Error("pictures are imported from PNG files");
    const bytes = new Uint8Array(await readFile(req.sourcePath));
    const image = decodePng(bytes); // throws a PngError for a broken file
    await mkdir(folder, { recursive: true });
    if (req.kind === "sprite") {
      const json = req.sprite ? SpriteJsonSchema.parse(req.sprite) : oneFrameSprite(image.width, image.height);
      await writeFile(join(folder, "sheet.png"), bytes);
      await writeFile(join(folder, "sprite.json"), toJsonText(json));
    } else {
      await writeFile(join(folder, "background.png"), bytes);
      await writeFile(
        join(folder, "background.json"),
        toJsonText(BackgroundJsonSchema.parse({ file: "background.png" })),
      );
    }
    return { name: req.name };
  }

  if (!SOUND.has(ext)) throw new Error("sounds are imported from .wav, .mp3, .xm, .mod, .it or .s3m files");
  const file = basename(req.sourcePath);
  const json: SoundJson = SoundJsonSchema.parse({
    kind: req.sound?.kind ?? (MUSIC.has(ext) ? "music" : "effect"),
    file,
  });
  await mkdir(folder, { recursive: true });
  await copyFile(req.sourcePath, join(folder, file));
  await writeFile(join(folder, "sound.json"), toJsonText(json));
  return { name: req.name };
}
