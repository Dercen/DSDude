/**
 * The repo's samples/ and docs/ for the mock host, through Vite globs (browser-only: no fs). Text files are inlined;
 * binary files (PNG, WAV) are served by Vite and fetched on demand.
 */
import { load, type Project, type ProjectFs } from "@dsdude/project-format";
import { IMAGE_TYPES, imageSources, imageTarget, titleOf } from "../../shared/learn-text.ts";

const REPO = "../../../../../";

const SAMPLE_TEXT = import.meta.glob<string>("../../../../../samples/*/**/*.{json,dss}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const SAMPLE_BINARY = import.meta.glob<string>("../../../../../samples/*/**/*.{png,wav,mp3,xm,mod,it,s3m}", {
  query: "?url",
  import: "default",
  eager: true,
});
const DOCS = import.meta.glob<string>("../../../../../docs/{tutorial,manual,reference}/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const DOC_IMAGES = import.meta.glob<string>(
  "../../../../../docs/{tutorial,manual,reference}/**/*.{png,jpg,jpeg,gif,webp}",
  {
    query: "?url",
    import: "default",
    eager: true,
  },
);

/** Repo-relative path ("samples/flappy/project.json") of a glob key. */
const repoPath = (key: string) => key.slice(REPO.length);

function index<T>(glob: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(glob).map(([k, v]) => [repoPath(k), v]));
}

const sampleText = index(SAMPLE_TEXT);
const sampleBinary = index(SAMPLE_BINARY);
export const docTexts = index(DOCS);
const docImages = index(DOC_IMAGES);

/** Names of the samples that are DSDude projects (they have a project.json). */
export function sampleNames(): string[] {
  return [...sampleText.keys()]
    .filter((p) => /^samples\/[^/]+\/project\.json$/.test(p))
    .map((p) => p.split("/")[1] ?? "")
    .sort();
}

/** A read-only ProjectFs over the inlined sample files, rooted at "/samples/<name>". */
function sampleFs(): ProjectFs {
  const all = [...sampleText.keys(), ...sampleBinary.keys()].map((p) => `/${p}`);
  return {
    readFile: async (path) => {
      const text = sampleText.get(path.replace(/^\//, ""));
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
    writeFile: async () => {
      throw new Error("the mock host's samples are read-only; project.save keeps the project in memory");
    },
    readDir: async (path) => {
      const prefix = `${path.replace(/\/$/, "")}/`;
      const names = new Set<string>();
      for (const p of all) if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split("/")[0] ?? "");
      names.delete("");
      if (names.size === 0) throw new Error(`ENOENT: ${path}`);
      return [...names];
    },
    exists: async (path) => {
      const p = path.replace(/\/$/, "");
      return all.some((q) => q === p || q.startsWith(`${p}/`));
    },
  };
}

/** Loads samples/<name> through C1 `load`, exactly as the IDE would. */
export async function loadSample(name: string): Promise<{ dir: string; project: Project }> {
  const dir = `/samples/${name}`;
  const { project, diagnostics } = await load(sampleFs(), dir);
  if (!project) throw new Error(`samples/${name}: ${diagnostics.map((d) => d.message).join("; ")}`);
  return { dir, project };
}

/** The bytes of a binary sample file, e.g. ("flappy", "sprites/spr_bird/sheet.png"); null when absent. */
export async function sampleFile(name: string, path: string): Promise<Uint8Array | null> {
  const url = sampleBinary.get(`samples/${name}/${path}`);
  if (!url) return null;
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

export function listDocs(): { path: string; title: string; section: "tutorial" | "manual" | "reference" }[] {
  const order = { tutorial: 0, manual: 1, reference: 2 } as const;
  return [...docTexts.entries()]
    .filter(([path]) => !path.includes("/assets/"))
    .map(([path, text]) => ({
      path,
      title: titleOf(text, (path.split("/").pop() ?? path).replace(/\.md$/, "")),
      section: path.split("/")[1] as "tutorial" | "manual" | "reference",
    }))
    .sort((a, b) => order[a.section] - order[b.section] || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function dataUrl(url: string, type: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:${type};base64,${btoa(binary)}`;
}

/** C5 learn.read over the repo docs (or `extra` documents a test supplies). */
export async function readDoc(
  path: string,
  extra: Readonly<Record<string, string>> = {},
): Promise<{ path: string; markdown: string; images: Record<string, string> }> {
  const markdown = extra[path] ?? docTexts.get(path);
  if (markdown === undefined) throw new Error(`ENOENT: ${path}`);
  const images: Record<string, string> = {};
  for (const src of imageSources(markdown)) {
    const target = imageTarget(path, src);
    const url = target ? docImages.get(target) : undefined;
    const type = target ? IMAGE_TYPES[target.slice(target.lastIndexOf(".") + 1).toLowerCase()] : undefined;
    if (url && type) images[src] = await dataUrl(url, type);
  }
  return { path, markdown, images };
}
