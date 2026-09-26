/**
 * Renderer security rules shared by the window setup and the IPC handlers (PLAN.md 2.5; docs/research/06-idestack.md
 * section 9). Pure functions: node Vitest covers them without Electron.
 */
import { APP_ORIGIN } from "./protocol.ts";

/** The CSP of every renderer page; index.html carries the same string in its meta tag. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:";

/** Origins the renderer may be served from: `app://ide`, the dev server, or `file://` (spike fallback). */
export function isTrustedRendererUrl(url: string, devServerUrl: string | undefined): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`)) return true;
  if (devServerUrl) {
    try {
      if (parsed.origin === new URL(devServerUrl).origin) return true;
    } catch {
      // ignore a malformed ELECTRON_RENDERER_URL
    }
  }
  return parsed.protocol === "file:";
}

/** dockview popouts open `popout.html` from the renderer's own origin; every other window.open is denied. */
export function isDockviewPopout(url: string, devServerUrl: string | undefined): boolean {
  if (!isTrustedRendererUrl(url, devServerUrl)) return false;
  try {
    return new URL(url).pathname.endsWith("/popout.html");
  } catch {
    return false;
  }
}
