/** Pure helpers over Learn markdown, shared by main (learn.ts) and the mock host. */

/** The first "# " heading, else `fallback`. */
export function titleOf(markdown: string, fallback: string): string {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  return m?.[1] ?? fallback;
}

/** Relative image sources used by the markdown: `![alt](src "title")`, `![alt](<src> "title")` and `<img src>`. */
export function imageSources(markdown: string): string[] {
  const out = new Set<string>();
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g)) {
    const src = m[1] ?? m[2];
    if (src) out.add(src);
  }
  for (const m of markdown.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) if (m[1]) out.add(m[1]);
  return [...out].filter((src) => !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//") && !src.startsWith("#"));
}

/** The docs/ path an image source points at from `docPath`, or null when it leaves docs/ or is not an image. */
export function imageTarget(docPath: string, src: string): string | null {
  let rel = src.split(/[?#]/)[0] ?? "";
  try {
    rel = decodeURI(rel);
  } catch {
    return null;
  }
  const parts = docPath.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (seg !== "." && seg !== "") parts.push(seg);
  }
  const target = parts.join("/");
  if (!target.startsWith("docs/") || !/\.(png|jpe?g|gif|webp)$/i.test(target)) return null;
  return target;
}

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
