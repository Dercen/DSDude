/**
 * Learn markdown -> sanitised HTML (docs/kickoff/ws6.md task 4): marked 14 (MIT) parses, DOMPurify 3 (MPL-2.0 OR
 * Apache-2.0) sanitises. Nothing here evaluates code, and images only ever come from the data: URLs main supplied
 * (C5 learn.read), so no remote image loads: every other <img> becomes its alt text. Headings get C12 slug ids.
 */
import DOMPurify from "dompurify";
import { Marked, type Tokens } from "marked";
import { headingSlug } from "../panels/api.ts";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function lookup(images: Readonly<Record<string, string>>, src: string): string | null {
  if (src.startsWith("data:image/")) return src;
  let decoded = src;
  try {
    decoded = decodeURI(src);
  } catch {
    // keep the raw form
  }
  return images[src] ?? images[decoded] ?? null;
}

/** URIs a link or image may keep: web links (shown, never navigated), Learn links, anchors and relative paths. */
const ALLOWED_URI =
  /^(?:(?:https?|mailto|dsdude-learn):|data:image\/(?:png|jpeg|gif|webp);base64,|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.\-:]|$))/i;

let currentImages: Readonly<Record<string, string>> = {};
let hooked = false;

function installHooks(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName !== "IMG") return;
    const img = node as HTMLImageElement;
    const src = lookup(currentImages, img.getAttribute("src") ?? "");
    if (src) {
      img.setAttribute("src", src);
      img.setAttribute("loading", "lazy");
      return;
    }
    const alt = node.ownerDocument.createElement("span");
    alt.className = "learn-missing-image";
    alt.textContent = img.getAttribute("alt") ?? "";
    img.replaceWith(alt);
  });
}

export function renderMarkdown(markdown: string, images: Readonly<Record<string, string>> = {}): string {
  const marked = new Marked({ gfm: true, async: false });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        return `<h${depth} id="${escapeHtml(headingSlug(text))}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      image({ href, title, text }: Tokens.Image) {
        const src = lookup(images, href);
        if (!src) return `<span class="learn-missing-image">${escapeHtml(text)}</span>`;
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""}>`;
      },
    },
  });
  const html = marked.parse(markdown) as string;
  installHooks();
  currentImages = images;
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: [
        "style",
        "form",
        "input",
        "button",
        "textarea",
        "select",
        "iframe",
        "object",
        "embed",
        "video",
        "audio",
      ],
      FORBID_ATTR: ["style", "srcset"],
      ALLOWED_URI_REGEXP: ALLOWED_URI,
    });
  } finally {
    currentImages = {};
  }
}

/** Resolves a relative markdown link against the document it appears in ("../manual/x.md#y" from docs/tutorial/a.md). */
export function resolveDocLink(fromPath: string, href: string): { path: string; anchor?: string } | null {
  const [rawPath = "", anchor] = href.split("#");
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawPath) || rawPath.startsWith("/")) return null;
  let target = rawPath;
  try {
    target = decodeURI(rawPath);
  } catch {
    return null;
  }
  if (target === "") return anchor ? { path: fromPath, anchor } : null;
  if (!target.toLowerCase().endsWith(".md")) return null;
  const parts = fromPath.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  const path = parts.join("/");
  if (!/^docs\/(tutorial|manual|reference)\/.+\.md$/.test(path)) return null;
  return anchor ? { path, anchor } : { path };
}
