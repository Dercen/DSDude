/**
 * Contract C1 v0.1.0: the in-memory Project and browser-safe load/save over an injected ProjectFs.
 * Spec: contracts/project-format.md. How to change me: see src/schema.ts.
 */
import type { z } from "zod";
import { PROJECT_CATALOG as P } from "./diagnostics/catalog.ts";
import { type Diagnostic, makeDiagnostic } from "./diagnostics.ts";
import {
  type BackgroundJson,
  BackgroundJsonSchema,
  FORMAT_VERSION,
  NAME,
  type ObjectJson,
  ObjectJsonSchema,
  type ProjectJson,
  ProjectJsonSchema,
  type RoomJson,
  RoomJsonSchema,
  type SoundJson,
  SoundJsonSchema,
  type SpriteJson,
  SpriteJsonSchema,
} from "./schema.ts";

/** File access injected by the caller: the Node adapter is `@dsdude/project-format/node`. Paths use "/". */
export interface ProjectFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  /** Names (files and folders) directly inside `path`, in any order. */
  readDir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export type SpriteResource = SpriteJson & { name: string };
export type BackgroundResource = BackgroundJson & { name: string };
export type SoundResource = SoundJson & { name: string };
export type ObjectResource = ObjectJson & {
  name: string;
  /** Event file stem (e.g. "step", "collision_obj_pipe") -> DSS source. */
  events: Record<string, string>;
  /** objects/<name>/functions.dss, or null when absent. */
  functions: string | null;
};
export type RoomResource = RoomJson & { name: string };
export interface ScriptResource {
  name: string;
  source: string;
}

/** A loaded project. Resource lists are sorted by name (code point), except `rooms`, in project.json order. */
export interface Project {
  /** The project folder as given to load(), with "/" separators. */
  dir: string;
  project: ProjectJson;
  sprites: SpriteResource[];
  backgrounds: BackgroundResource[];
  sounds: SoundResource[];
  objects: ObjectResource[];
  rooms: RoomResource[];
  scripts: ScriptResource[];
}

export interface LoadResult {
  /** null only when project.json itself is missing or unusable. */
  project: Project | null;
  diagnostics: Diagnostic[];
}

const KINDS = ["sprites", "backgrounds", "sounds", "objects", "rooms"] as const;
type Kind = (typeof KINDS)[number];
const JSON_FILE: Record<Kind, string> = {
  sprites: "sprite.json",
  backgrounds: "background.json",
  sounds: "sound.json",
  objects: "object.json",
  rooms: "room.json",
};

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const join = (...parts: string[]): string => parts.join("/").replace(/\\/g, "/").replace(/\/+/g, "/");

/** Serialises a JSON file the way every DSDude tool writes it: 2-space indent and a final LF. */
export function toJsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function load(fs: ProjectFs, dir: string): Promise<LoadResult> {
  const root = dir.replace(/\\/g, "/").replace(/\/$/, "");
  const diagnostics: Diagnostic[] = [];
  const at = (file: string) => ({ file });

  async function readJson<S extends z.ZodType>(rel: string, schema: S): Promise<z.infer<S> | null> {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(join(root, rel)));
    } catch (err) {
      diagnostics.push(
        makeDiagnostic(P.E291, "project", { file: rel, detail: String((err as Error).message) }, at(rel)),
      );
      return null;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".") || "(file)";
        diagnostics.push(makeDiagnostic(P.E292, "project", { file: rel, field, problem: issue.message }, at(rel)));
      }
      return null;
    }
    return parsed.data;
  }

  if (!(await fs.exists(join(root, "project.json")))) {
    diagnostics.push(makeDiagnostic(P.E290, "project", { dir: root }));
    return { project: null, diagnostics };
  }
  let rawProject: unknown;
  try {
    rawProject = JSON.parse(await fs.readFile(join(root, "project.json")));
  } catch (err) {
    diagnostics.push(
      makeDiagnostic(P.E291, "project", { file: "project.json", detail: (err as Error).message }, at("project.json")),
    );
    return { project: null, diagnostics };
  }
  const found = (rawProject as { formatVersion?: unknown } | null)?.formatVersion;
  if (typeof found === "number" && found > FORMAT_VERSION) {
    diagnostics.push(makeDiagnostic(P.E296, "project", { found, expected: FORMAT_VERSION }, at("project.json")));
    return { project: null, diagnostics };
  }
  const meta = ProjectJsonSchema.safeParse(rawProject);
  if (!meta.success) {
    for (const issue of meta.error.issues) {
      const field = issue.path.join(".") || "(file)";
      diagnostics.push(
        makeDiagnostic(P.E292, "project", { file: "project.json", field, problem: issue.message }, at("project.json")),
      );
    }
    return { project: null, diagnostics };
  }

  const project: Project = {
    dir: root,
    project: meta.data,
    sprites: [],
    backgrounds: [],
    sounds: [],
    objects: [],
    rooms: [],
    scripts: [],
  };

  async function names(folder: string): Promise<string[]> {
    if (!(await fs.exists(join(root, folder)))) return [];
    const out: string[] = [];
    for (const n of (await fs.readDir(join(root, folder))).sort(byCodePoint)) {
      if (NAME.test(n)) out.push(n);
      else diagnostics.push(makeDiagnostic(P.E295, "project", { folder: `${folder}/${n}` }, at(`${folder}/${n}`)));
    }
    return out;
  }
  async function requireFile(rel: string): Promise<void> {
    if (!(await fs.exists(join(root, rel))))
      diagnostics.push(makeDiagnostic(P.E293, "project", { file: rel }, at(rel)));
  }

  for (const name of await names("sprites")) {
    const json = await readJson(`sprites/${name}/${JSON_FILE.sprites}`, SpriteJsonSchema);
    if (!json) continue;
    await requireFile(`sprites/${name}/sheet.png`);
    project.sprites.push({ name, ...json });
  }
  for (const name of await names("backgrounds")) {
    const json = await readJson(`backgrounds/${name}/${JSON_FILE.backgrounds}`, BackgroundJsonSchema);
    if (!json) continue;
    await requireFile(`backgrounds/${name}/${json.file}`);
    project.backgrounds.push({ name, ...json });
  }
  for (const name of await names("sounds")) {
    const json = await readJson(`sounds/${name}/${JSON_FILE.sounds}`, SoundJsonSchema);
    if (!json) continue;
    await requireFile(`sounds/${name}/${json.file}`);
    project.sounds.push({ name, ...json });
  }
  for (const name of await names("objects")) {
    const json = await readJson(`objects/${name}/${JSON_FILE.objects}`, ObjectJsonSchema);
    if (!json) continue;
    const events: Record<string, string> = {};
    let functions: string | null = null;
    for (const f of (await fs.readDir(join(root, "objects", name))).sort(byCodePoint)) {
      if (!f.endsWith(".dss")) continue;
      const source = await fs.readFile(join(root, "objects", name, f));
      if (f === "functions.dss") functions = source;
      else events[f.slice(0, -4)] = source;
    }
    project.objects.push({ name, ...json, events, functions });
  }
  const roomFolders = await names("rooms");
  for (const name of project.project.rooms) {
    if (!roomFolders.includes(name)) {
      diagnostics.push(
        makeDiagnostic(P.E297, "project", { problem: "lists a missing folder for", name }, at("project.json")),
      );
      continue;
    }
    const json = await readJson(`rooms/${name}/${JSON_FILE.rooms}`, RoomJsonSchema);
    if (json) project.rooms.push({ name, ...json });
  }
  for (const name of roomFolders) {
    if (!project.project.rooms.includes(name))
      diagnostics.push(makeDiagnostic(P.E297, "project", { problem: "does not list", name }, at("project.json")));
  }
  if (await fs.exists(join(root, "scripts"))) {
    for (const f of (await fs.readDir(join(root, "scripts"))).sort(byCodePoint)) {
      if (!f.endsWith(".dss")) continue;
      const name = f.slice(0, -4);
      if (!NAME.test(name)) {
        diagnostics.push(makeDiagnostic(P.E295, "project", { folder: `scripts/${f}` }, at(`scripts/${f}`)));
        continue;
      }
      project.scripts.push({ name, source: await fs.readFile(join(root, "scripts", f)) });
    }
  }
  await requireFile(project.project.icon);

  checkReferences(project, diagnostics);
  return { project, diagnostics };
}

function checkReferences(p: Project, diagnostics: Diagnostic[]): void {
  const owner = new Map<string, string>();
  const claim = (name: string, kind: string) => {
    const prev = owner.get(name);
    if (prev) diagnostics.push(makeDiagnostic(P.E298, "project", { name, a: prev, b: kind }));
    else owner.set(name, kind);
  };
  for (const s of p.sprites) claim(s.name, "sprite");
  for (const b of p.backgrounds) claim(b.name, "background");
  for (const s of p.sounds) claim(s.name, "sound");
  for (const o of p.objects) claim(o.name, "object");
  for (const r of p.rooms) claim(r.name, "room");
  for (const s of p.scripts) claim(s.name, "script");

  const has = (list: { name: string }[], name: string) => list.some((x) => x.name === name);
  const unknown = (file: string, kind: string, name: string) =>
    diagnostics.push(makeDiagnostic(P.E294, "project", { file, kind, name }, { file }));

  if (!p.project.rooms.includes(p.project.firstRoom)) unknown("project.json", "room", p.project.firstRoom);
  for (const o of p.objects) {
    const file = `objects/${o.name}/object.json`;
    if (o.sprite !== null && !has(p.sprites, o.sprite)) unknown(file, "sprite", o.sprite);
    if (o.parent !== null && !has(p.objects, o.parent)) unknown(file, "object", o.parent);
  }
  const parentOf = new Map(p.objects.map((o) => [o.name, o.parent]));
  const reported = new Set<string>();
  for (const o of p.objects) {
    const chain = [o.name];
    let cur = parentOf.get(o.name) ?? null;
    while (cur !== null && !chain.includes(cur)) {
      chain.push(cur);
      cur = parentOf.get(cur) ?? null;
    }
    if (cur === o.name && !reported.has(o.name)) {
      for (const c of chain) reported.add(c);
      diagnostics.push(makeDiagnostic(P.E299, "project", { name: o.name, chain: [...chain, o.name].join(" -> ") }));
    }
  }
  for (const r of p.rooms) {
    const file = `rooms/${r.name}/room.json`;
    for (const s of ["top", "bottom"] as const) {
      const bg = r.screens[s].background;
      if (bg !== null && !has(p.backgrounds, bg)) unknown(file, "background", bg);
    }
    for (const i of r.instances) if (!has(p.objects, i.object)) unknown(file, "object", i.object);
  }
}

/**
 * Writes every JSON and DSS file of `project` under `dir`, in the canonical form load() reads back
 * byte for byte. It never deletes files and never writes images or sounds (the IDE imports those).
 */
export async function save(fs: ProjectFs, dir: string, project: Project): Promise<void> {
  const root = dir.replace(/\\/g, "/").replace(/\/$/, "");
  const write = (rel: string, text: string) => fs.writeFile(join(root, rel), text);
  await write("project.json", toJsonText(ProjectJsonSchema.parse(project.project)));
  for (const { name, ...json } of project.sprites)
    await write(`sprites/${name}/sprite.json`, toJsonText(SpriteJsonSchema.parse(json)));
  for (const { name, ...json } of project.backgrounds)
    await write(`backgrounds/${name}/background.json`, toJsonText(BackgroundJsonSchema.parse(json)));
  for (const { name, ...json } of project.sounds)
    await write(`sounds/${name}/sound.json`, toJsonText(SoundJsonSchema.parse(json)));
  for (const { name, events, functions, ...json } of project.objects) {
    await write(`objects/${name}/object.json`, toJsonText(ObjectJsonSchema.parse(json)));
    for (const [stem, source] of Object.entries(events)) await write(`objects/${name}/${stem}.dss`, source);
    if (functions !== null) await write(`objects/${name}/functions.dss`, functions);
  }
  for (const { name, ...json } of project.rooms)
    await write(`rooms/${name}/room.json`, toJsonText(RoomJsonSchema.parse(json)));
  for (const s of project.scripts) await write(`scripts/${s.name}.dss`, s.source);
}
