/**
 * New Project (PLAN.md 1 step 1, 6 WS6): the templates WS7 lists in `templates/index.json` (C5 TemplateIndexSchema),
 * and creating `<parent>/<name>` from one through C1 (project-format load + save for the name and title).
 * `root` is the folder holding `templates/` (the repo in development, `resources/` when packaged).
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TemplateIndexSchema } from "@dsdude/ipc-contract";
import type { Project } from "@dsdude/project-format";
import { loadProject, saveProject } from "@dsdude/project-format/node";
import { inside } from "./files.ts";
import { defaultIconPng } from "./icon.ts";

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
}

/** Where a template's files come from; null for the built-in Empty template. */
interface TemplateSource extends TemplateInfo {
  dir: string | null;
}

export const EMPTY_TEMPLATE: TemplateSource = {
  id: "empty",
  title: "Empty",
  description: "One room on both screens and nothing in it.",
  dir: null,
};

/**
 * The templates in wizard order: templates/index.json when it exists; otherwise Empty, plus (development only,
 * `samples` set) the repo's samples that are DSDude projects, until WS7 ships templates/.
 */
export async function templateSources(root: string, samples: string | null): Promise<TemplateSource[]> {
  const index = join(root, "templates", "index.json");
  if (existsSync(index)) {
    const parsed = TemplateIndexSchema.parse(JSON.parse(await readFile(index, "utf8")));
    return parsed.templates.map((t) => ({ ...t, dir: inside(join(root, "templates"), t.dir) }));
  }
  const out: TemplateSource[] = [EMPTY_TEMPLATE];
  if (samples && existsSync(samples)) {
    for (const name of (await readdir(samples)).sort()) {
      const dir = join(samples, name);
      if (!existsSync(join(dir, "project.json"))) continue;
      const loaded = await loadProject(dir);
      if (!loaded.project) continue;
      out.push({
        id: `sample-${name}`,
        title: loaded.project.project.title,
        description: `The samples/${name} project (development build; WS7's templates replace it).`,
        dir,
      });
    }
  }
  return out;
}

export function emptyProject(name: string, dir: string): Project {
  return {
    dir,
    project: {
      formatVersion: 0,
      name,
      title: name,
      subtitle: "",
      author: "",
      gamecode: "####",
      icon: "icon.png",
      firstRoom: "rm_main",
      rooms: ["rm_main"],
    },
    sprites: [],
    backgrounds: [],
    sounds: [],
    objects: [],
    rooms: [
      {
        name: "rm_main",
        width: 256,
        height: 192,
        layout: "separate",
        screens: {
          top: { background: null, viewX: 0, viewY: 0 },
          bottom: { background: null, viewX: 0, viewY: 0 },
        },
        instances: [],
      },
    ],
    scripts: [],
  };
}

/** Creates `<parent>/<name>` from the template and returns its folder. */
export async function createProject(opts: {
  parent: string;
  name: string;
  template: string;
  sources: TemplateSource[];
}): Promise<string> {
  const source = opts.sources.find((t) => t.id === opts.template);
  if (!source) throw new Error(`there is no template called ${opts.template}`);
  const dir = join(opts.parent, opts.name);
  if (existsSync(dir) && (await readdir(dir)).length > 0) throw new Error(`${dir} already exists and is not empty`);
  await mkdir(dir, { recursive: true });
  if (source.dir === null) {
    await writeFile(join(dir, "icon.png"), defaultIconPng());
    await saveProject(dir, emptyProject(opts.name, dir));
    return dir;
  }
  await cp(source.dir, dir, {
    recursive: true,
    // Build output never lives in a project (PLAN.md 3.2), and a template's own build/ is not part of it.
    filter: (src) => !/[\\/](build|\.git)([\\/]|$)/.test(src.slice(source.dir?.length ?? 0)),
  });
  const loaded = await loadProject(dir);
  if (!loaded.project) throw new Error(`the ${source.title} template is not a DSDude project`);
  const p = loaded.project;
  await saveProject(dir, { ...p, project: { ...p.project, name: opts.name, title: opts.name } });
  return dir;
}
