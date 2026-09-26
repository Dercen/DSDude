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
import { inside } from "./files.ts";

export interface LearnDoc {
  path: string;
  title: string;
  section: (typeof LEARN_SECTIONS)[number];
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
/** Larger images are left out (the renderer shows the alt text). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function titleOf(markdown: string, fallback: string): string {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  return m?.[1] ?? fallback;
}

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

/** Relative image sources used by the markdown: `![alt](src "title")` and `<img src="...">`. */
export function imageSources(markdown: string): string[] {
  const out = new Set<string>();
  // ![alt](src "title") and ![alt](<src with spaces> "title")
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g)) {
    const src = m[1] ?? m[2];
    if (src) out.add(src);
  }
  for (const m of markdown.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) if (m[1]) out.add(m[1]);
  return [...out].filter((src) => !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//") && !src.startsWith("#"));
}

export async function readLearnDoc(
  root: string,
  path: string,
): Promise<{ path: string; markdown: string; images: Record<string, string> }> {
  const markdown = await readFile(inside(root, path), "utf8");
  const images: Record<string, string> = {};
  for (const src of imageSources(markdown)) {
    const target = posix.normalize(posix.join(posix.dirname(path), decodeURI(src.split(/[?#]/)[0] ?? "")));
    const type = IMAGE_TYPES[posix.extname(target).slice(1).toLowerCase()];
    if (!type || !target.startsWith("docs/")) continue;
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
