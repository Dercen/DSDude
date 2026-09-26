/**
 * `project.readFile` / `project.writeFile` (C5 0.4.0): asset files inside the project folder only. The schema already
 * refuses "..", absolute paths and other extensions; resolving checks containment once more.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

/** Absolute path of `rel` inside `root`, or an error when it would leave `root`. */
export function inside(root: string, rel: string): string {
  const base = resolve(root);
  const full = resolve(base, rel);
  const back = relative(base, full);
  if (back === "" || back.startsWith("..") || isAbsolute(back)) throw new Error(`${rel} is outside ${root}`);
  return full;
}

export async function readProjectFile(dir: string, path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(inside(dir, path)));
}

/** Writes through a temporary file and a rename, so a crash never leaves half an image. */
export async function writeProjectFile(dir: string, path: string, bytes: Uint8Array): Promise<void> {
  const full = inside(dir, path);
  await mkdir(dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, full);
}
