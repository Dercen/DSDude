// The room editor (PixiJS 8) in the mock host: placing, wall painting, erasing, undo, the 129-sprite meter, and the
// 60 fps check on a 1024x512 room with 200 instances at 4x zoom (it reports here; the Electron test enforces it),
// and rm_game rebuilt with the mouse (the saved room.json round-trips; fixtures/editors keeps one).
import { type Project, RoomJsonSchema, toJsonText } from "@dsdude/project-format";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { createMockHost, type MockHost } from "../../mock-host/index.ts";
import roomEditor from "./index.tsx";

let host: MockHost | null = null;
afterEach(() => {
  host?.dispose();
  host = null;
});

const until = async (check: () => boolean, what = "", ms = 8000) => {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** Room pixel (x, y) on the top screen -> client coordinates (pan starts at 16,16; zoom `z`). */
function at(canvas: HTMLCanvasElement, x: number, y: number, z: number) {
  const r = canvas.getBoundingClientRect();
  return { clientX: r.left + 16 + x * z + z / 2, clientY: r.top + 16 + y * z + z / 2 };
}

function pointer(canvas: HTMLCanvasElement, type: string, p: { clientX: number; clientY: number }) {
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, ...p }));
}

async function mountGame(h: MockHost) {
  // A wall object for the block-platformer paint mode: invisible, no sprite.
  h.ide.actions.updateResource({ kind: "object", name: "obj_wall" }, (d) => {
    d.objects.push({
      name: "obj_wall",
      sprite: null,
      parent: null,
      visible: false,
      depth: 0,
      screen: "top",
      events: {},
      functions: null,
    });
  });
  const m = await h.mountEditor(roomEditor, { kind: "room", name: "rm_game" });
  const canvas = () => m.element.querySelector("[data-testid=room-canvas][data-ready]") as HTMLCanvasElement | null;
  await until(() => !!canvas(), "the Pixi canvas, taking input");
  return { m, canvas: canvas as () => HTMLCanvasElement };
}

const room = (h: MockHost) => h.ide.store.getState().project?.rooms.find((r) => r.name === "rm_game");

describe("room editor", () => {
  it("places an instance with one click and undoes it", async () => {
    host = await createMockHost();
    const h = host;
    const { m, canvas } = await mountGame(h);
    const before = room(h)?.instances.length ?? 0;
    (m.element.querySelector("[data-testid='room-tool:place']") as HTMLButtonElement).click();
    const select = m.element.querySelector("[data-testid=room-object]") as HTMLSelectElement;
    select.value = "obj_pipe";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const p = at(canvas(), 70, 40, 2);
    pointer(canvas(), "pointerdown", p);
    pointer(canvas(), "pointerup", p);
    await until(() => (room(h)?.instances.length ?? 0) === before + 1, "placed");
    // Grid 16 with snap: (70, 40) -> (64, 32).
    expect(room(h)?.instances.at(-1)).toEqual({ object: "obj_pipe", x: 64, y: 32 });
    expect(h.ide.store.getState().dirty["rooms/rm_game/room.json"]).toBe(true);
    m.host.undo.undo();
    await until(() => (room(h)?.instances.length ?? 0) === before, "undone");
    await page.screenshot({ path: "../../../../test-results/browser/room-editor.png" });
  });

  it("paints invisible walls on grid cells in one step (no sprite slot), and erases them", async () => {
    host = await createMockHost();
    const h = host;
    const { m, canvas } = await mountGame(h);
    const walls = () => room(h)?.instances.filter((i) => i.object === "obj_wall").length ?? 0;
    (m.element.querySelector("[data-testid='room-tool:paint']") as HTMLButtonElement).click();
    const select = m.element.querySelector("[data-testid=room-object]") as HTMLSelectElement;
    select.value = "obj_wall";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    pointer(canvas(), "pointerdown", at(canvas(), 0, 176, 2));
    for (let x = 0; x < 256; x += 8) pointer(canvas(), "pointermove", at(canvas(), x, 176, 2));
    pointer(canvas(), "pointerup", at(canvas(), 255, 176, 2));
    await until(() => walls() === 16, "16 wall cells");
    expect(m.host.undo.peek().undo).toBe("Paint");
    const topMeter = () => (m.element.querySelector("[data-testid='room-meter:top']") as HTMLElement).textContent;
    expect(topMeter()).toMatch(/^Top: 1\/128 sprites$/); // walls are invisible: only obj_bird counts
    (m.element.querySelector("[data-testid='room-tool:erase']") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 50));
    pointer(canvas(), "pointerdown", at(canvas(), 20, 180, 2));
    pointer(canvas(), "pointerup", at(canvas(), 20, 180, 2));
    await until(() => walls() === 15, "one wall erased");
  });

  it("shows a red meter, not a crash, for the 129th sprite on a screen", async () => {
    host = await createMockHost();
    const h = host;
    const { m } = await mountGame(h);
    h.ide.actions.updateResource({ kind: "room", name: "rm_game" }, (d) => {
      const r = d.rooms.find((x) => x.name === "rm_game");
      for (let i = 0; r && i < 128; i++)
        r.instances.push({ object: "obj_bird", x: (i % 16) * 16, y: Math.floor(i / 16) * 16 });
    });
    const meter = () => m.element.querySelector("[data-testid='room-meter:top']") as HTMLElement;
    await until(() => meter().textContent === "Top: 129/128 sprites", "meter at 129");
    expect(meter().className).toContain("meter-over");
    expect(m.element.querySelector("[data-testid=room-canvas]")).not.toBeNull();
  });

  it("shows live sprite memory and colour sets per screen, raised by the last build's figures", async () => {
    host = await createMockHost();
    const h = host;
    const { m } = await mountGame(h);
    const meter = (id: string) => m.element.querySelector(`[data-testid='${id}']`) as HTMLElement;
    const kbOf = (id: string) => Number(/memory ([\d.]+) KB/.exec(meter(id).textContent ?? "")?.[1]);
    // Only obj_bird has a sprite in rm_game; the bottom screen is empty.
    await until(() => kbOf("room-meter:top:memory") > 0, "top memory");
    expect(meter("room-meter:top:memory").textContent).toMatch(/^memory [\d.]+ KB\/128 KB$/);
    expect(meter("room-meter:top:colours").textContent).toBe("colour sets 1/16");
    expect(meter("room-meter:bottom:memory").textContent).toBe("memory 0 KB/128 KB");
    // A pipe on the bottom screen loads spr_pipe there.
    h.ide.actions.updateResource({ kind: "room", name: "rm_game" }, (d) => {
      d.rooms.find((x) => x.name === "rm_game")?.instances.push({ object: "obj_pipe", x: 0, y: 0, screen: "bottom" });
    });
    await until(() => kbOf("room-meter:bottom:memory") > 0, "bottom memory");
    expect(meter("room-meter:bottom:colours").textContent).toBe("colour sets 1/16");

    // The last build counted sprites the room's code creates: past the limit, the meter is red.
    host.dispose();
    host = await createMockHost({
      handlers: {
        "build.manifest": () => ({
          manifest: { rooms: { rm_game: { top: { objVramBytes: 140_000, obj16Palettes: 17, obj256Palettes: 0 } } } },
        }),
      },
    });
    const again = await mountGame(host);
    const meter2 = (id: string) => again.m.element.querySelector(`[data-testid='${id}']`) as HTMLElement;
    await until(() => meter2("room-meter:top:memory").className.includes("meter-over"), "memory over");
    expect(meter2("room-meter:top:memory").textContent).toBe("memory 137 KB/128 KB");
    expect(meter2("room-meter:top:colours").textContent).toBe("colour sets 17/16");
    expect(meter2("room-meter:top:colours").className).toContain("meter-over");
  });

  it("builds rm_game from scratch with the mouse: the saved room.json round-trips, and a fixture is kept", async () => {
    host = await createMockHost();
    const h = host;
    const m = await h.mountEditor(roomEditor, { kind: "room", name: "rm_game" });
    const canvas = () => m.element.querySelector("[data-testid=room-canvas]") as HTMLCanvasElement;
    await until(() => !!m.element.querySelector("[data-testid=room-canvas][data-ready]"), "the Pixi canvas");
    const q = (id: string) => m.element.querySelector(`[data-testid='${id}']`) as HTMLElement;
    const tick = () => new Promise((r) => setTimeout(r, 50));

    // Rubber-band the whole top screen and delete everything.
    pointer(canvas(), "pointerdown", at(canvas(), 250, 188, 2));
    pointer(canvas(), "pointermove", at(canvas(), 1, 1, 2));
    pointer(canvas(), "pointerup", at(canvas(), 1, 1, 2));
    await tick();
    q("room-editor:rm_game").dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await until(() => room(h)?.instances.length === 0, "room emptied");

    // Place the controller, the HUD and the bird as the sample has them (grid 16, snap on).
    q("room-tool:place").click();
    const select = q("room-object") as HTMLSelectElement;
    const place = async (object: string, x: number, y: number) => {
      select.value = object;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      pointer(canvas(), "pointerdown", at(canvas(), x, y, 2));
      pointer(canvas(), "pointerup", at(canvas(), x, y, 2));
      await tick();
    };
    await place("obj_bird", 70, 100);
    await place("obj_ctrl", 3, 3);
    await place("obj_hud", 5, 2);
    expect(await h.ide.actions.save()).toBe(true);
    const text = (p: Project | undefined) => {
      const r = p?.rooms.find((x) => x.name === "rm_game");
      if (!r) throw new Error("rm_game missing");
      const { name: _, ...json } = r;
      return toJsonText(RoomJsonSchema.parse(json));
    };
    // Paths are relative to apps/ide (the Vitest root).
    const root = "../../";
    const sample = await commands.readFile(`${root}samples/flappy/rooms/rm_game/room.json`);
    expect(text(h.saved.at(-1))).toBe(sample.replace(/\r/g, ""));

    // Plus a pipe, saved as the fixture WS0 builds end to end (written when missing, compared otherwise).
    await place("obj_pipe", 200, 140);
    expect(await h.ide.actions.save()).toBe(true);
    const saved = text(h.saved.at(-1));
    expect(JSON.parse(saved).instances.at(-1)).toEqual({ object: "obj_pipe", x: 192, y: 128 });
    const fixture = `${root}fixtures/editors/flappy-rm_game/room.json`;
    const existing = await commands.readFile(fixture).catch(() => null);
    if (existing === null) await commands.writeFile(fixture, saved);
    else expect(saved).toBe(existing.replace(/\r/g, ""));
  });

  it("renders a 1024x512 room with 200 instances at 4x zoom while panning (fps report)", async () => {
    host = await createMockHost();
    const h = host;
    h.ide.actions.updateResource({ kind: "room", name: "rm_game" }, (d) => {
      const r = d.rooms.find((x) => x.name === "rm_game");
      if (!r) return;
      r.width = 1024;
      r.height = 512;
      r.instances = Array.from({ length: 200 }, (_, i) => ({
        object: i % 2 ? "obj_pipe" : "obj_bird",
        x: (i * 37) % 1024,
        y: (i * 53) % 512,
        ...(i % 3 === 0 ? { screen: "bottom" as const } : {}),
      }));
    });
    const { m, canvas } = await mountGame(h);
    (m.element.querySelector("[data-testid=room-zoom-in]") as HTMLButtonElement).click(); // 2x -> 4x
    await until(() => m.element.textContent?.includes("4x") ?? false, "4x zoom");
    await new Promise((r) => setTimeout(r, 1200));
    // Pan every animation frame for ~2 s, then read the frames rendered in the last second.
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const step = () => {
        canvas().dispatchEvent(new WheelEvent("wheel", { deltaX: 3, deltaY: 1, bubbles: true, cancelable: true }));
        if (performance.now() - t0 < 2100) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    const fps = Number((m.element.querySelector("[data-testid=room-canvas-box]") as HTMLElement).dataset.fps);
    console.info(`room editor: ${fps} fps (1024x512, 200 instances, 4x)`);
    // Headless Chromium may render WebGL in software: this reports; the Electron e2e test enforces 55+.
    expect(fps).toBeGreaterThan(20);
  });
});
