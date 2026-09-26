/**
 * The room editor (PLAN.md 6 WS6b, done by WS6): a C12 EditorPanel over the project store (zustand) with PixiJS 8 as
 * the view only. Both DS screens stacked, each with its background, a grid, its instances and its 256x192 view;
 * tools: select/move (with rubber band), place, paint walls (grid snap, for invisible obj_wall blocks), erase, view.
 * One undo step per gesture (immer patches through host.project). Pixi textures come from ImageData canvases (the
 * CSP has no blob:), and `pixi.js/unsafe-eval` keeps Pixi working without 'unsafe-eval'. Renders on demand.
 */
import "pixi.js/unsafe-eval";
import { decodePng } from "@dsdude/asset-pipeline/browser";
import {
  DS_SCREEN,
  deleteInstances,
  drawOrder,
  eraseCells,
  hitTest,
  instanceBox,
  instancesIn,
  MARKER,
  moveInstances,
  type ObjectInfo,
  paintCells,
  placeInstance,
  type RoomLike,
  type Screen,
  type SpriteInfo,
  setView,
  snap,
  spritesPerScreen,
} from "@dsdude/editor-core";
import type { Project } from "@dsdude/project-format";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { LIMITS } from "../../meters.ts";
import type { EditorPanel, EditorPanelFactory, PanelHost, ResourceRef } from "../../panels/api.ts";
import { updateWithUndo } from "../../panels/kit.ts";

type Tool = "select" | "place" | "paint" | "erase" | "view";
const TOOLS: [Tool, string, string][] = [
  ["select", "Select", "Pick instances and drag them (V)"],
  ["place", "Place", "Click to put the chosen object in the room (P)"],
  ["paint", "Paint walls", "Drag to fill grid cells with the chosen object, e.g. an invisible obj_wall (B)"],
  ["erase", "Erase", "Click or drag over instances to remove them (E)"],
  ["view", "View", "Drag a screen's view: the part of the room the DS shows (W)"],
];
const KEYS: Record<string, Tool> = { v: "select", p: "place", b: "paint", e: "erase", w: "view" };

/** Room pixels between the two stacked screens. */
const GAP = 24;

export interface RoomScene {
  objects: Map<string, ObjectInfo>;
  sprites: Map<string, SpriteInfo>;
}

export function sceneOf(project: Project): RoomScene {
  return {
    objects: new Map(
      project.objects.map((o) => [
        o.name,
        { name: o.name, sprite: o.sprite, screen: o.screen, visible: o.visible, depth: o.depth },
      ]),
    ),
    sprites: new Map(
      project.sprites.map((s) => [
        s.name,
        { name: s.name, frameWidth: s.frameWidth, frameHeight: s.frameHeight, origin: s.origin },
      ]),
    ),
  };
}

function useProject(host: PanelHost): Project | null {
  return useSyncExternalStore((cb) => host.project.subscribe(() => cb()), host.project.get);
}

function textureFrom(rgba: Uint8Array, width: number, height: number, sx = 0, sw = width): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = height;
  const img = new ImageData(sw, height);
  for (let y = 0; y < height; y++)
    img.data.set(rgba.subarray((y * width + sx) * 4, (y * width + sx + sw) * 4), y * sw * 4);
  canvas.getContext("2d")?.putImageData(img, 0, 0);
  const t = Texture.from(canvas);
  t.source.scaleMode = "nearest";
  return t;
}

/** Loads frame 0 of every sprite and every background as Pixi textures (missing files are skipped). */
async function loadTextures(host: PanelHost, project: Project) {
  const sprites = new Map<string, Texture>();
  const backgrounds = new Map<string, Texture>();
  await Promise.all([
    ...project.sprites.map(async (s) => {
      try {
        const img = decodePng(await host.files.read(`sprites/${s.name}/sheet.png`));
        sprites.set(s.name, textureFrom(img.rgba, img.width, img.height, 0, Math.min(s.frameWidth, img.width)));
      } catch {
        // drawn as a marker
      }
    }),
    ...project.backgrounds.map(async (b) => {
      try {
        const img = decodePng(await host.files.read(`backgrounds/${b.name}/${b.file}`));
        backgrounds.set(b.name, textureFrom(img.rgba, img.width, img.height));
      } catch {
        // drawn as the plain room colour
      }
    }),
  ]);
  return { sprites, backgrounds };
}

function RoomEditor({ host, name }: { host: PanelHost; name: string }) {
  const project = useProject(host);
  const room = project?.rooms.find((r) => r.name === name) as (RoomLike & { name: string }) | undefined;
  const scene = useMemo(() => (project ? sceneOf(project) : null), [project]);
  const [tool, setTool] = useState<Tool>("select");
  const [objectName, setObjectName] = useState<string>(
    () => project?.objects.find((o) => o.name === "obj_wall")?.name ?? project?.objects[0]?.name ?? "",
  );
  const [grid, setGrid] = useState(16);
  const [snapOn, setSnapOn] = useState(true);
  const [zoom, setZoom] = useState(2);
  const [selected, setSelected] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const pixi = useRef<{
    app: Application;
    world: Container;
    screens: Record<Screen, Container>;
    /** Gesture previews (moved boxes, rubber band, painted cells, view rectangle), drawn above everything. */
    ghost: Graphics;
    textures: Awaited<ReturnType<typeof loadTextures>>;
    request: () => void;
    frames: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [fps, setFps] = useState(0);
  const state = useRef({ tool, objectName, grid, snapOn, zoom, selected, pan: { x: 16, y: 16 } });
  state.current = { ...state.current, tool, objectName, grid, snapOn, zoom, selected };
  const resource: ResourceRef = { kind: "room", name };

  // Pixi setup (once per mount).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the Pixi app lives for the whole panel.
  useEffect(() => {
    const el = box.current;
    const proj = host.project.get();
    if (!el || !proj) return;
    let disposed = false;
    const app = new Application();
    (async () => {
      await app.init({ resizeTo: el, background: "#181818", antialias: false, preference: "webgl", autoStart: false });
      if (disposed) {
        app.destroy(true);
        return;
      }
      el.appendChild(app.canvas);
      app.canvas.dataset.testid = "room-canvas";
      const world = new Container();
      const screens = { top: new Container(), bottom: new Container() };
      const ghost = new Graphics();
      world.addChild(screens.top, screens.bottom, ghost);
      app.stage.addChild(world);
      const textures = await loadTextures(host, proj);
      let queued = false;
      const handle = {
        app,
        world,
        screens,
        ghost,
        textures,
        frames: 0,
        request: () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            if (disposed) return;
            app.render();
            handle.frames++;
          });
        },
      };
      pixi.current = handle;
      new ResizeObserver(() => handle.request()).observe(el);
      setReady(true);
    })();
    // Frames rendered per second, for the 60 fps check (data-fps on the canvas box).
    const timer = setInterval(() => {
      const h = pixi.current;
      if (!h) return;
      setFps(h.frames);
      h.frames = 0;
    }, 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      const h = pixi.current;
      pixi.current = null;
      if (h) {
        for (const t of [...h.textures.sprites.values(), ...h.textures.backgrounds.values()]) t.destroy(true);
        h.app.destroy(true, { children: true });
      } else if (app.renderer) app.destroy(true);
    };
  }, []);

  // Draw the scene whenever the room, the selection or the view settings change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ready` draws the first frame once Pixi has started.
  useEffect(() => {
    const h = pixi.current;
    if (!h || !room || !scene) return;
    const { screens, textures } = h;
    const s = state.current;
    h.world.scale.set(zoom);
    h.world.position.set(s.pan.x, s.pan.y);
    for (const screen of ["top", "bottom"] as const) {
      const c = screens[screen];
      for (const child of c.removeChildren()) child.destroy({ children: true });
      c.position.set(0, screen === "top" ? 0 : room.height + GAP);
      c.addChild(new Graphics().rect(0, 0, room.width, room.height).fill(0x2b2b2b));
      const bg = room.screens[screen].background;
      const bgTex = bg ? textures.backgrounds.get(bg) : undefined;
      if (bgTex) c.addChild(new Sprite(bgTex));
      if (grid > 1) {
        const g = new Graphics();
        for (let x = grid; x < room.width; x += grid) g.moveTo(x, 0).lineTo(x, room.height);
        for (let y = grid; y < room.height; y += grid) g.moveTo(0, y).lineTo(room.width, y);
        g.stroke({ width: 1 / zoom, color: 0xffffff, alpha: 0.08 });
        c.addChild(g);
      }
      const layer = new Container();
      for (const i of drawOrder(room, scene.objects, screen)) {
        const inst = room.instances[i];
        if (!inst) continue;
        const obj = scene.objects.get(inst.object);
        const b = instanceBox(inst, scene.objects, scene.sprites);
        const tex = obj?.sprite ? textures.sprites.get(obj.sprite) : undefined;
        if (tex) {
          const sp = new Sprite(tex);
          sp.position.set(b.x, b.y);
          // Invisible objects (walls) are drawn faintly: the DS does not draw them.
          if (obj && !obj.visible) sp.alpha = 0.35;
          layer.addChild(sp);
        } else {
          layer.addChild(
            new Graphics()
              .rect(b.x, b.y, b.width, b.height)
              .fill({ color: obj?.visible === false ? 0x3a6ea5 : 0x7a5bc2, alpha: 0.55 })
              .stroke({ width: 1 / zoom, color: 0xffffff, alpha: 0.5 }),
          );
        }
        if (selected.includes(i))
          layer.addChild(new Graphics().rect(b.x, b.y, b.width, b.height).stroke({ width: 2 / zoom, color: 0x3794ff }));
      }
      c.addChild(layer);
      const v = room.screens[screen];
      c.addChild(
        new Graphics()
          .rect(v.viewX, v.viewY, DS_SCREEN.width, DS_SCREEN.height)
          .stroke({ width: 2 / zoom, color: screen === "top" ? 0xffd166 : 0x06d6a0 }),
      );
      const label = new Text({
        text: screen === "top" ? "Top screen" : "Bottom screen (touch)",
        style: { fill: 0xcccccc, fontSize: 12, fontFamily: "Segoe UI" },
        // Rasterise at the zoomed size so the label stays sharp.
        resolution: zoom * (window.devicePixelRatio || 1),
      });
      label.scale.set(1 / zoom);
      label.position.set(0, -14 / zoom);
      c.addChild(label);
    }
    h.request();
  }, [ready, room, scene, selected, zoom, grid]);

  // Pointer input on the Pixi canvas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers read the latest state through refs.
  useEffect(() => {
    const h = pixi.current;
    if (!h) return;
    const canvas = h.app.canvas;
    /** Canvas pixel -> {screen, room x, y} (null in the gap or outside). */
    const toRoom = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      const s = state.current;
      const wx = (e.clientX - r.left - s.pan.x) / s.zoom;
      const wy = (e.clientY - r.top - s.pan.y) / s.zoom;
      const rm = host.project.get()?.rooms.find((x) => x.name === name);
      if (!rm) return null;
      if (wy >= 0 && wy < rm.height) return { screen: "top" as Screen, x: wx, y: wy };
      const by = wy - rm.height - GAP;
      if (by >= 0 && by < rm.height) return { screen: "bottom" as Screen, x: wx, y: by };
      return null;
    };
    const current = () => {
      const p = host.project.get();
      const rm = p?.rooms.find((x) => x.name === name) as RoomLike | undefined;
      return p && rm ? { rm, sc: sceneOf(p) } : null;
    };
    const update = (label: string, recipe: (r: RoomLike) => void) =>
      updateWithUndo(host, resource, label, (d) => {
        const r = d.rooms.find((x) => x.name === name);
        if (r) recipe(r as RoomLike);
      });

    let gesture:
      | { kind: "move"; start: { x: number; y: number }; screen: Screen; indices: number[]; last: [number, number] }
      | { kind: "band"; start: { x: number; y: number }; screen: Screen }
      | { kind: "paint" | "erase"; screen: Screen; points: [number, number][] }
      | { kind: "view"; screen: Screen; start: { x: number; y: number }; view: [number, number] }
      | { kind: "pan"; start: { x: number; y: number }; pan: { x: number; y: number } }
      | null = null;

    const onDown = (e: PointerEvent) => {
      canvas.focus();
      if (e.button === 1) {
        gesture = { kind: "pan", start: { x: e.clientX, y: e.clientY }, pan: { ...state.current.pan } };
        return;
      }
      const at = toRoom(e);
      const cur = current();
      if (!at || !cur) return;
      const s = state.current;
      const sn = (v: number) => (s.snapOn ? snap(v, s.grid) : Math.round(v));
      if (s.tool === "select") {
        const hit = hitTest(cur.rm, cur.sc.objects, cur.sc.sprites, at.screen, at.x, at.y);
        if (hit >= 0) {
          const indices = s.selected.includes(hit) ? s.selected : e.shiftKey ? [...s.selected, hit] : [hit];
          setSelected(indices);
          gesture = { kind: "move", start: at, screen: at.screen, indices, last: [0, 0] };
        } else {
          if (!e.shiftKey) setSelected([]);
          gesture = { kind: "band", start: at, screen: at.screen };
        }
      } else if (s.tool === "place" && s.objectName) {
        let index = -1;
        update("Place", (r) => {
          index = placeInstance(r, cur.sc.objects, s.objectName, sn(at.x), sn(at.y), at.screen);
        });
        setSelected([index]);
      } else if (s.tool === "paint" || s.tool === "erase") {
        gesture = { kind: s.tool, screen: at.screen, points: [[at.x, at.y]] };
      } else if (s.tool === "view") {
        const v = cur.rm.screens[at.screen];
        gesture = { kind: "view", screen: at.screen, start: at, view: [v.viewX, v.viewY] };
      }
    };

    /** Clears the ghost and draws boxes in room coordinates of `screen`. */
    const ghostBoxes = (
      screen: Screen,
      boxes: { x: number; y: number; width: number; height: number }[],
      color: number,
    ) => {
      const rm = current()?.rm;
      if (!rm) return;
      const oy = screen === "top" ? 0 : rm.height + GAP;
      const z = state.current.zoom;
      h.ghost.clear();
      for (const b of boxes) h.ghost.rect(b.x, b.y + oy, b.width, b.height);
      if (boxes.length > 0) h.ghost.fill({ color, alpha: 0.2 }).stroke({ width: 2 / z, color });
      h.request();
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture;
      if (!g) return;
      if (g.kind === "pan") {
        state.current.pan = { x: g.pan.x + e.clientX - g.start.x, y: g.pan.y + e.clientY - g.start.y };
        h.world.position.set(state.current.pan.x, state.current.pan.y);
        h.request();
        return;
      }
      const at = toRoom(e);
      if (!at) return;
      if (g.kind === "move") {
        const s = state.current;
        const dx = s.snapOn ? snap(at.x - g.start.x, s.grid) : Math.round(at.x - g.start.x);
        const dy = s.snapOn ? snap(at.y - g.start.y, s.grid) : Math.round(at.y - g.start.y);
        // Live preview: shift the screen's instance layer children would need a rebuild; move the whole layer's
        // selected sprites through a temporary offset on commit instead, and show the offset as a ghost outline.
        g.last = [dx, dy];
        const cur = current();
        if (cur)
          ghostBoxes(
            g.screen,
            g.indices.map((i) => {
              const b = instanceBox(cur.rm.instances[i] ?? { object: "", x: 0, y: 0 }, cur.sc.objects, cur.sc.sprites);
              return { ...b, x: b.x + dx, y: b.y + dy };
            }),
            0x3794ff,
          );
      } else if (g.kind === "band" && at.screen === g.screen) {
        ghostBoxes(
          g.screen,
          [
            {
              x: Math.min(g.start.x, at.x),
              y: Math.min(g.start.y, at.y),
              width: Math.abs(at.x - g.start.x),
              height: Math.abs(at.y - g.start.y),
            },
          ],
          0xffffff,
        );
      } else if ((g.kind === "paint" || g.kind === "erase") && at.screen === g.screen) {
        g.points.push([at.x, at.y]);
        const s = state.current;
        const cell = s.snapOn ? s.grid : MARKER;
        ghostBoxes(
          g.screen,
          g.points.map(([x, y]) => ({ x: snap(x, cell), y: snap(y, cell), width: cell, height: cell })),
          g.kind === "paint" ? 0x06d6a0 : 0xef476f,
        );
      } else if (g.kind === "view" && at.screen === g.screen) {
        const rm = current()?.rm;
        if (rm) {
          const [vx, vy] = [g.view[0] + (at.x - g.start.x), g.view[1] + (at.y - g.start.y)];
          const x = Math.max(0, Math.min(Math.round(vx), rm.width - DS_SCREEN.width));
          const y = Math.max(0, Math.min(Math.round(vy), rm.height - DS_SCREEN.height));
          ghostBoxes(g.screen, [{ x, y, width: DS_SCREEN.width, height: DS_SCREEN.height }], 0xffd166);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture;
      gesture = null;
      h.ghost.clear();
      h.request();
      const cur = current();
      if (!g || !cur) return;
      const at = toRoom(e);
      const s = state.current;
      if (g.kind === "move" && (g.last[0] !== 0 || g.last[1] !== 0)) {
        update(g.indices.length > 1 ? "Move Instances" : "Move Instance", (r) =>
          moveInstances(r, g.indices, g.last[0], g.last[1]),
        );
      } else if (g.kind === "band" && at && at.screen === g.screen) {
        const band = {
          x: Math.min(g.start.x, at.x),
          y: Math.min(g.start.y, at.y),
          width: Math.abs(at.x - g.start.x),
          height: Math.abs(at.y - g.start.y),
        };
        if (band.width > 1 || band.height > 1)
          setSelected(instancesIn(cur.rm, cur.sc.objects, cur.sc.sprites, g.screen, band));
      } else if (g.kind === "paint" && s.objectName) {
        update("Paint", (r) => {
          paintCells(r, cur.sc.objects, s.objectName, g.screen, g.points, s.snapOn ? s.grid : MARKER);
        });
      } else if (g.kind === "erase") {
        const hits = new Set<number>();
        for (const [x, y] of g.points) {
          const i = hitTest(cur.rm, cur.sc.objects, cur.sc.sprites, g.screen, x, y);
          if (i >= 0) hits.add(i);
        }
        if (hits.size > 0) {
          update("Erase", (r) => deleteInstances(r, [...hits]));
          setSelected([]);
        } else if (s.objectName)
          update("Erase", (r) => {
            eraseCells(r, cur.sc.objects, s.objectName, g.screen, g.points, s.grid);
          });
      } else if (g.kind === "view" && at && at.screen === g.screen) {
        const nx = g.view[0] + (at.x - g.start.x);
        const ny = g.view[1] + (at.y - g.start.y);
        update("Move View", (r) => setView(r, g.screen, nx, ny));
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = state.current;
      if (e.ctrlKey) {
        const next = Math.max(1, Math.min(8, s.zoom * (e.deltaY < 0 ? 2 : 0.5)));
        if (next === s.zoom) return;
        // Keep the point under the pointer still.
        const r = canvas.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        state.current.pan = {
          x: cx - ((cx - s.pan.x) / s.zoom) * next,
          y: cy - ((cy - s.pan.y) / s.zoom) * next,
        };
        setZoom(next);
      } else {
        state.current.pan = { x: s.pan.x - e.deltaX, y: s.pan.y - e.deltaY };
        h.world.position.set(state.current.pan.x, state.current.pan.y);
        h.request();
      }
    };

    const onDbl = (e: MouseEvent) => {
      const at = toRoom(e as PointerEvent);
      const cur = current();
      if (!at || !cur) return;
      const i = hitTest(cur.rm, cur.sc.objects, cur.sc.sprites, at.screen, at.x, at.y);
      const obj = i >= 0 ? cur.rm.instances[i]?.object : undefined;
      if (obj) host.openResource({ kind: "object", name: obj });
    };

    canvas.tabIndex = 0;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDbl);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDbl);
    };
  }, [ready]);

  if (!project || !room || !scene) return <div className="panel-empty">{name} is not in this project.</div>;
  const counts = spritesPerScreen(room, scene.objects);
  const max = LIMITS.spritesPerScreen ?? 128;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey) return;
    const t = KEYS[e.key.toLowerCase()];
    if (t) {
      setTool(t);
      e.preventDefault();
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
      updateWithUndo(host, resource, selected.length > 1 ? "Delete Instances" : "Delete Instance", (d) => {
        const r = d.rooms.find((x) => x.name === name);
        if (r) deleteInstances(r as RoomLike, selected);
      });
      setSelected([]);
      e.preventDefault();
    }
  };

  return (
    <div
      className="room-editor"
      role="application"
      aria-label={`Room editor: ${name}`}
      tabIndex={-1}
      data-testid={`room-editor:${name}`}
      onKeyDown={onKey}
    >
      <div className="se-toolbar" role="toolbar" aria-label="Room tools">
        {TOOLS.map(([t, label, tip]) => (
          <button
            key={t}
            type="button"
            className={tool === t ? "active" : ""}
            aria-pressed={tool === t}
            title={tip}
            data-testid={`room-tool:${t}`}
            onClick={() => setTool(t)}
          >
            {label}
          </button>
        ))}
        <label title="The object Place and Paint put down">
          Object{" "}
          <select value={objectName} onChange={(e) => setObjectName(e.target.value)} data-testid="room-object">
            {project.objects.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
                {o.visible ? "" : " (invisible)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grid{" "}
          <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} data-testid="room-grid">
            {[1, 8, 16, 32].map((g) => (
              <option key={g} value={g}>
                {g === 1 ? "off" : g}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> Snap
        </label>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 2))}>
          -
        </button>
        <span className="se-zoom">{zoom}x</span>
        <button
          type="button"
          aria-label="Zoom in"
          data-testid="room-zoom-in"
          onClick={() => setZoom((z) => Math.min(8, z * 2))}
        >
          +
        </button>
        <span className="se-gap" />
        {(["top", "bottom"] as const).map((sc) => (
          <span
            key={sc}
            className={`meter meter-${counts[sc] > max ? "over" : counts[sc] >= max * 0.9 ? "warn" : "ok"}`}
            data-testid={`room-meter:${sc}`}
            title={`OAM: the DS draws at most ${max} sprites on a screen. Invisible objects (walls) do not count.`}
          >
            {sc === "top" ? "Top" : "Bottom"}: {counts[sc]}/{max} sprites
          </span>
        ))}
      </div>
      <div className="room-canvas" ref={box} data-fps={fps} data-testid="room-canvas-box" />
    </div>
  );
}

/** The room editor's C12 factory (default export: the shell loads editors/<name>/index.tsx). */
const roomEditorFactory: EditorPanelFactory = {
  kind: "room",
  canOpen: (r) => r.kind === "room",
  create({ element, host }): EditorPanel {
    const root = createRoot(element);
    let id = "room:";
    return {
      get id() {
        return id;
      },
      kind: "room",
      open(resource) {
        id = `room:${resource.name}`;
        root.render(<RoomEditor host={host} name={resource.name} />);
      },
      // Everything lives in the project store, which Save writes (project.save).
      async save() {},
      dispose() {
        root.unmount();
      },
      onDirty() {
        return () => {};
      },
    };
  },
};

export default roomEditorFactory;
