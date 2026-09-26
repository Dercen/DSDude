// The sprite editor in the mock host (headless Chromium) on samples/flappy's spr_bird: draw, undo/redo, frames,
// save a DS indexed PNG through the host, and a screenshot.
import { decodePng } from "@dsdude/asset-pipeline/browser";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createMockHost, type MockHost } from "../../mock-host/index.ts";
import spriteEditor from "./index.tsx";

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

/** Pointer events at frame pixel (x, y) of the editor canvas. */
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

describe("sprite editor", () => {
  it("draws a stroke as one undo step, adds a frame and saves the sheet and frame count", async () => {
    host = await createMockHost();
    const m = await host.mountEditor(spriteEditor, { kind: "sprite", name: "spr_bird" });
    const canvas = () => m.element.querySelector("[data-testid=sprite-canvas]") as HTMLCanvasElement;
    // Wait until the editor sized its canvas to the 16-pixel frame (a canvas starts at 300 wide).
    await until(() => !!canvas() && canvas().width % 16 === 0 && canvas().width >= 32);
    const zoom = canvas().width / 16;
    expect(m.element.querySelectorAll("[data-testid^='frame:']")).toHaveLength(3);

    // A pencil stroke from (0,0) to (3,0) in colour 1.
    (m.element.querySelector("[data-testid='swatch:1']") as HTMLButtonElement).click();
    pointer(canvas(), "pointerdown", 0, 0, zoom);
    pointer(canvas(), "pointermove", 3, 0, zoom);
    pointer(canvas(), "pointerup", 3, 0, zoom);
    await until(() => m.dirty(), "dirty after the stroke");
    expect(m.host.undo.peek().undo).toBe("Draw");
    m.host.undo.undo();
    await until(() => !m.dirty(), "clean after undo");
    m.host.undo.redo();
    await until(() => m.dirty(), "dirty after redo");

    // A line and a fill are single steps too.
    (m.element.querySelector("[data-testid='tool:line']") as HTMLButtonElement).click();
    pointer(canvas(), "pointerdown", 0, 15, zoom);
    pointer(canvas(), "pointermove", 15, 15, zoom);
    pointer(canvas(), "pointerup", 15, 15, zoom);
    await until(() => m.host.undo.peek().undo === "Line", "line");

    // The memory meter is live: a fourth frame costs a fourth more.
    const memory = () => m.element.querySelector("[data-testid='sprite-meter:memory']")?.textContent ?? "";
    expect(memory()).toMatch(/^Memory: [\d.]+ KB of 128 KB$/);
    const kbOf = () => Number(/Memory: ([\d.]+) KB/.exec(memory())?.[1]);
    const three = kbOf();
    (m.element.querySelector("[data-testid=frame-add]") as HTMLButtonElement).click();
    await until(() => m.element.querySelectorAll("[data-testid^='frame:']").length === 4, "4 frames");
    await until(() => kbOf() > three, "more memory with 4 frames");
    await page.screenshot({ path: "../../../../test-results/browser/sprite-editor.png" });

    await m.panel.save();
    const png = host.files.get("sprites/spr_bird/sheet.png");
    expect(png).toBeDefined();
    const image = decodePng(png as Uint8Array);
    expect([image.width, image.height]).toEqual([64, 16]);
    // Pixel (1, 0) of frame 0 is drawn now (opaque).
    expect(image.rgba[(0 * 64 + 1) * 4 + 3]).toBe(255);
    expect(host.ide.store.getState().project?.sprites.find((s) => s.name === "spr_bird")?.frames).toBe(4);
    expect(m.dirty()).toBe(false);
  });

  it("mirrors, onion-skins and animates", async () => {
    host = await createMockHost();
    const m = await host.mountEditor(spriteEditor, { kind: "sprite", name: "spr_bird" });
    await until(() => !!m.element.querySelector("[data-testid=mirror-h]"));
    (m.element.querySelector("[data-testid=mirror-h]") as HTMLButtonElement).click();
    await until(() => m.host.undo.peek().undo === "Mirror");
    (m.element.querySelector("[data-testid=onion]") as HTMLInputElement).click();
    (m.element.querySelector("[data-testid=anim-play]") as HTMLButtonElement).click();
    await until(() => (m.element.querySelector("[data-testid=anim-play]") as HTMLButtonElement).textContent === "Stop");
  });
});
