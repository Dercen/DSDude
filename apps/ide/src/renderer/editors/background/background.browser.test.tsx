// The background editor in the mock host (headless Chromium) on the Phase-0 background: the tile meter follows
// edits, one undo step per stroke, save writes a DS indexed PNG; an over-limit picture shows red meters, not a
// crash; a screenshot.
import { decodePng, encodeDsIndexedPng } from "@dsdude/asset-pipeline/browser";
import { backgroundDocFromPng, backgroundStats } from "@dsdude/editor-core";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { createMockHost, type MockHost } from "../../mock-host/index.ts";
import backgroundEditor from "./index.tsx";

let host: MockHost | null = null;
afterEach(() => {
  host?.dispose();
  host = null;
});

const until = async (check: () => boolean, what = "", ms = 5000) => {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, zoom: number) {
  const r = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      clientX: r.left + x * zoom + zoom / 2,
      clientY: r.top + y * zoom + zoom / 2,
    }),
  );
}

/** Paths are relative to apps/ide (the Vitest root). */
async function fixturePng(): Promise<Uint8Array> {
  const b64 = await commands.readFile("../../fixtures/assets/background256x192.png", "base64");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** 4-colour xorshift noise: nearly every tile unique. */
function noisePng(width: number, height: number): Uint8Array {
  let s = 7;
  const indices = new Uint8Array(width * height);
  for (let i = 0; i < indices.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    indices[i] = 1 + ((s >>> 0) % 4);
  }
  return encodeDsIndexedPng(width, height, indices, [0x7c1f, 0x001f, 0x03e0, 0x7c00, 0x7fff]);
}

async function mountBackground(h: MockHost, png: Uint8Array, width = 256) {
  h.files.set("backgrounds/bg_sky/background.png", png);
  h.ide.actions.updateResource({ kind: "background", name: "bg_sky" }, (d) => {
    d.backgrounds.push({ name: "bg_sky", file: "background.png" });
  });
  const m = await h.mountEditor(backgroundEditor, { kind: "background", name: "bg_sky" });
  const canvas = () => m.element.querySelector("[data-testid=background-canvas]") as HTMLCanvasElement;
  await until(() => !!canvas() && canvas().width % width === 0 && canvas().width > 0, "the sized canvas");
  const text = (id: string) => (m.element.querySelector(`[data-testid='${id}']`) as HTMLElement).textContent;
  return { m, canvas, text, zoom: canvas().width / width };
}

describe("background editor", () => {
  it("shows the pipeline's tile count, follows a stroke, undoes it and saves a DS indexed PNG", async () => {
    host = await createMockHost();
    const h = host;
    const png = await fixturePng();
    const before = backgroundStats(backgroundDocFromPng(png).frames[0] as never);
    const { m, canvas, text, zoom } = await mountBackground(h, png);
    expect(m.element.querySelector("[data-testid=frame-strip]")).toBeNull();
    expect(text("bg-meter:tiles")).toBe(`Tiles: ${before.tiles}/1024`);
    expect(text("bg-meter:size")).toBe("Size: 256x192");

    // A diagonal line through the picture adds unique tiles.
    (m.element.querySelector("[data-testid='swatch:1']") as HTMLButtonElement).click();
    (m.element.querySelector("[data-testid='tool:line']") as HTMLButtonElement).click();
    pointer(canvas(), "pointerdown", 0, 0, zoom);
    pointer(canvas(), "pointermove", 150, 150, zoom);
    pointer(canvas(), "pointerup", 150, 150, zoom);
    await until(() => m.dirty(), "dirty after the line");
    expect(m.host.undo.peek().undo).toBe("Line");
    const tiles = () => Number(/Tiles: (\d+)/.exec(text("bg-meter:tiles") ?? "")?.[1]);
    await until(() => tiles() > before.tiles, "more tiles after the line");

    (m.element.querySelector("[data-testid=show-tiles]") as HTMLInputElement).click();
    await page.screenshot({ path: "../../../../test-results/browser/background-editor.png" });

    await m.panel.save();
    await until(() => !m.dirty(), "clean after save");
    const saved = h.files.get("backgrounds/bg_sky/background.png");
    if (!saved) throw new Error("not saved");
    const img = decodePng(saved);
    expect([img.width, img.height]).toEqual([256, 192]);
    const after = backgroundStats(backgroundDocFromPng(saved).frames[0] as never);
    expect(after.tiles).toBe(tiles());

    m.host.undo.undo();
    await until(() => tiles() === before.tiles, "tile count back after undo");
  });

  it("shows red meters and a hint, not a crash, for a picture over 1024 tiles", async () => {
    host = await createMockHost();
    const { m, text } = await mountBackground(host, noisePng(320, 256), 320);
    expect(text("bg-meter:tiles")).toMatch(/^Tiles: \d{4}\/1024$/);
    expect((m.element.querySelector("[data-testid='bg-meter:tiles']") as HTMLElement).className).toContain(
      "meter-over",
    );
    expect(m.element.textContent).toContain("Too detailed to build");
    (m.element.querySelector("[data-testid=show-tiles]") as HTMLInputElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(m.element.querySelector("[data-testid=background-canvas]")).not.toBeNull();
  });
});
