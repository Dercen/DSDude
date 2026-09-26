/** @dsdude/project-format/node: the Node.js ProjectFs adapter (C1). Keep Node imports out of src/index.ts. */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type LoadResult, load, type Project, type ProjectFs, save } from "./project.ts";

/** Reads and writes UTF-8 text; writeFile creates missing folders and never converts line endings. */
export const nodeFs: ProjectFs = {
  readFile: (path) => readFile(path, "utf8"),
  async writeFile(path, text) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
  },
  readDir: (path) => readdir(path),
  exists: async (path) => existsSync(path),
};

export const loadProject = (dir: string): Promise<LoadResult> => load(nodeFs, dir);
export const saveProject = (dir: string, project: Project): Promise<void> => save(nodeFs, dir, project);
