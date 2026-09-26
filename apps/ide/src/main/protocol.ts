/**
 * The `app://` scheme that serves the built renderer (PLAN.md 2.5). It is registered as standard, secure and
 * supportFetchAPI before `ready`; `file://` stays available as the Phase-0 spike fallback (DSDUDE_RENDERER_FILE=1).
 */
import { isAbsolute, join, normalize, relative } from "node:path";

export const APP_SCHEME = "app";
/** Host part of every renderer URL: `app://ide/index.html`. */
export const APP_HOST = "ide";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * Maps an `app://ide/...` request URL to a file under `rendererDir`, or null when the URL is foreign or escapes
 * the directory. Pure, so node Vitest covers it without Electron.
 */
export function resolveAppUrl(rendererDir: string, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const file = normalize(join(rendererDir, pathname));
  const rel = relative(rendererDir, file);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return file;
}
