/**
 * Learn documents for the Learn panel (C5 `learn.list` / `learn.read`, 0.4.0): WS7's markdown under
 * docs/tutorial, docs/manual and docs/reference. `root` is the folder that contains `docs/`: the repo in development,
 * `resources/` in the packaged app (WS8 copies docs/ there), or DSDUDE_DOCS_DIR's parent. Local images are returned as
 * data: URLs, so the renderer never fetches files or remote images.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { posix } from "node:path";
import { LEARN_SECTIONS } from "@dsdude/ipc-contract";
import { IMAGE_TYPES, imageSources, imageTarget, titleOf } from "../shared/learn-text.ts";
import { inside } from "./files.ts";

export { imageSources, titleOf };

export interface LearnDoc {
  path: string;
  title: string;
  section: (typeof LEARN_SECTIONS)[number];
}

/** Larger images are left out (the renderer shows the alt text). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function walk(root: string, rel: string): Promise<string[]> {
  const dir = inside(root, rel);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => byName(a.name, b.name))) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "assets") out.push(...(await walk(root, child)));
    } else if (entry.name.toLowerCase().endsWith(".md")) out.push(child);
  }
  return out;
}

export async function listLearnDocs(root: string): Promise<LearnDoc[]> {
  const docs: LearnDoc[] = [];
  for (const section of LEARN_SECTIONS) {
    for (const path of await walk(root, `docs/${section}`)) {
      const text = await readFile(inside(root, path), "utf8");
      docs.push({ path, section, title: titleOf(text, posix.basename(path, ".md")) });
    }
  }
  return docs;
}

export async function readLearnDoc(
  root: string,
  path: string,
): Promise<{ path: string; markdown: string; images: Record<string, string> }> {
  const markdown = await readFile(inside(root, path), "utf8");
  const images: Record<string, string> = {};
  for (const src of imageSources(markdown)) {
    const target = imageTarget(path, src);
    const type = target ? IMAGE_TYPES[posix.extname(target).slice(1).toLowerCase()] : undefined;
    if (!target || !type) continue;
    try {
      const file = inside(root, target);
      if ((await stat(file)).size > MAX_IMAGE_BYTES) continue;
      images[src] = `data:${type};base64,${(await readFile(file)).toString("base64")}`;
    } catch {
      // a missing image shows its alt text
    }
  }
  return { path, markdown, images };
}
