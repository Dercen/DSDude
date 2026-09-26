/**
 * The sprite editor (PLAN.md 6 WS6b, done by WS6): a C12 EditorPanel over @dsdude/editor-core's sprite document.
 * Canvas 2D at zoom (imageSmoothingEnabled = false, image-rendering: pixelated); pencil, eraser, line, rectangle,
 * fill, select/move, mirror; an animation strip with onion skin; one undo entry per stroke (immer patches).
 * Opens sheet.png through the C12 preview (exactly what the DS shows) and saves a DS indexed PNG strip.
 */
import { encodeDsIndexedPng, previewSprite } from "@dsdude/asset-pipeline/browser";
import {
  addFrame,
  BUDGET_LIMITS,
  budgetLevel,
  clip,
  colorsUsed,
  deleteFrame,
  dsToHex,
  edit,
  type Frame,
  fill,
  hexToDs,
  line,
  mirror,
  moveFrame,
  moveRegion,
  paddedFrame,
  paletteIndex,
  pencil,
  type Rect,
  rect,
  rectBetween,
  renderFrame,
  type SpriteDoc,
  sameSprite,
  setFrame,
  sheetIndices,
  spriteBytes,
  spriteDocFromPreview,
} from "@dsdude/editor-core";
import type { Project } from "@dsdude/project-format";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { EditorPanel, EditorPanelFactory, PanelHost, ResourceRef } from "../../panels/api.ts";
import { kb } from "../shared/budget.ts";

type Tool = "pencil" | "eraser" | "line" | "rect" | "rectFill" | "fill" | "select";

const TOOLS: [Tool, string, string][] = [
  ["pencil", "Pencil", "P"],
  ["eraser", "Eraser", "E"],
  ["line", "Line", "L"],
  ["rect", "Rectangle", "R"],
  ["rectFill", "Filled rectangle", "Shift+R"],
  ["fill", "Fill", "F"],
  ["select", "Select and move", "S"],
];

type SpriteJson = Project["sprites"][number];

export interface SpriteEditorState {
  doc: SpriteDoc;
  frame: number;
}

/** Colour limit of the sprite's colour mode (the palette includes transparent index 0). */
export function maxColors(mode: SpriteJson["colorMode"]): number {
  return mode === "16" ? 16 : 256;
}

function drawFrame(canvas: HTMLCanvasElement | null, doc: SpriteDoc, index: number, zoom: number, onion: boolean) {
  if (!canvas) return;
  const w = doc.frameWidth;
  const h = doc.frameHeight;
  if (canvas.width !== w * zoom) canvas.width = w * zoom;
  if (canvas.height !== h * zoom) canvas.height = h * zoom;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const tmp = new OffscreenCanvas(w, h);
  tmp.getContext("2d")?.putImageData(new ImageData(renderFrame(doc, index, { onion }), w, h), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, w * zoom, h * zoom);
}

/**
 * The pixel editor view. `variant: "background"` (the background editor) edits one 8bpp image: no animation strip
 * or onion skin, 8x8 tile lines from 2x zoom, `aside` (the tile meters) under the palette and, with
 * `highlightTiles`, a "one-off tiles" overlay.
 */
export function SpriteEditor({
  host,
  name,
  initial,
  onChange,
  variant = "sprite",
  colorLimit,
  aside,
  highlightTiles,
}: {
  host: PanelHost;
  name: string;
  initial: SpriteDoc;
  onChange: (doc: SpriteDoc) => void;
  variant?: "sprite" | "background";
  colorLimit?: number;
  aside?: (doc: SpriteDoc) => ReactNode;
  highlightTiles?: (doc: SpriteDoc) => Rect[];
}) {
  const isSprite = variant === "sprite";
  const [doc, setDocState] = useState(initial);
  const docRef = useRef(initial);
  const [frameIndex, setFrameIndex] = useState(0);
  const [tool, setToolState] = useState<Tool>("pencil");
  // Pointer handlers read these refs, so events between renders see the current tool, colour and preview.
  const toolRef = useRef<Tool>("pencil");
  const setTool = (t: Tool) => {
    toolRef.current = t;
    setToolState(t);
  };
  const [color, setColorState] = useState(Math.min(1, initial.palette.length - 1));
  const colorRef = useRef(color);
  const setColor = (c: number) => {
    colorRef.current = c;
    setColorState(c);
  };
  const [zoom, setZoom] = useState(() => {
    const side = Math.max(initial.frameWidth, initial.frameHeight);
    return isSprite
      ? Math.max(2, Math.min(24, Math.floor(384 / side)))
      : Math.max(1, Math.min(8, Math.floor(512 / side)));
  });
  const [showTiles, setShowTiles] = useState(false);
  const [grid, setGrid] = useState(true);
  const [onion, setOnion] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [preview, setPreviewState] = useState<Frame | null>(null);
  const previewRef = useRef<Frame | null>(null);
  const setPreview = (p: Frame | null) => {
    previewRef.current = p;
    setPreviewState(p);
  };
  const [tick, setTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const animCanvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; start: SpriteDoc; last: [number, number]; moved?: Rect } | null>(null);
  const json = useMemo(() => host.project.get()?.sprites.find((s) => s.name === name), [host, name]);
  const limit = colorLimit ?? maxColors(json?.colorMode ?? "auto");
  const frameCount = doc.frames.length;
  const shown = Math.min(frameIndex, frameCount - 1);

  const setDoc = useCallback(
    (next: SpriteDoc) => {
      docRef.current = next;
      setDocState(next);
      onChange(next);
    },
    [onChange],
  );

  /** Records one undoable change from `before` to `after` (immer patches over the doc). */
  const commit = useCallback(
    (label: string, before: SpriteDoc, after: SpriteDoc) => {
      if (before === after) return;
      const e = edit(before, (d) => {
        d.frames = after.frames as never;
        d.palette = after.palette;
      });
      if (!e.changed) return;
      setDoc(e.next);
      host.undo.push({
        label,
        undo: () => setDoc(e.undo(docRef.current)),
        redo: () => setDoc(e.redo(docRef.current)),
      });
    },
    [host, setDoc],
  );

  // Canvas and overlay drawing.
  useEffect(() => {
    const base = preview ? setFrame(doc, shown, preview) : doc;
    drawFrame(canvas.current, base, shown, zoom, onion);
    const o = overlay.current;
    if (!o) return;
    o.width = doc.frameWidth * zoom;
    o.height = doc.frameHeight * zoom;
    const ctx = o.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, o.width, o.height);
    if (showTiles && highlightTiles) {
      ctx.fillStyle = "rgba(255,80,80,0.3)";
      for (const t of highlightTiles(doc)) ctx.fillRect(t.x * zoom, t.y * zoom, t.width * zoom, t.height * zoom);
    }
    if (grid && zoom >= 6) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      for (let x = 1; x < doc.frameWidth; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, o.height);
      }
      for (let y = 1; y < doc.frameHeight; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(o.width, y * zoom + 0.5);
      }
      ctx.stroke();
    }
    if (grid && zoom >= 2) {
      // 8x8 tile lines, as the DS stores sprites and backgrounds.
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      for (let x = 8; x < doc.frameWidth; x += 8) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, o.height);
      }
      for (let y = 8; y < doc.frameHeight; y += 8) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(o.width, y * zoom + 0.5);
      }
      ctx.stroke();
    }
    if (selection) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(
        selection.x * zoom + 0.5,
        selection.y * zoom + 0.5,
        selection.width * zoom - 1,
        selection.height * zoom - 1,
      );
    }
  }, [doc, shown, zoom, grid, onion, selection, preview, showTiles, highlightTiles]);

  // Animation preview.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000 / 8);
    return () => clearInterval(t);
  }, [playing]);
  useEffect(() => {
    drawFrame(animCanvas.current, doc, playing ? tick % frameCount : shown, 2, false);
  }, [doc, tick, playing, frameCount, shown]);

  const cell = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / zoom), Math.floor((e.clientY - r.top) / zoom)] as [number, number];
  };
  const current = () => docRef.current.frames[Math.min(frameIndex, docRef.current.frames.length - 1)] as Frame;
  const paint = () => (toolRef.current === "eraser" ? 0 : colorRef.current);

  const onDown = (e: React.PointerEvent) => {
    const tool = toolRef.current;
    const paintColor = paint();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events (tests) have no active pointer to capture
    }
    root.current?.focus();
    const [x, y] = cell(e);
    const start = docRef.current;
    if (tool === "select") {
      if (
        selection &&
        x >= selection.x &&
        y >= selection.y &&
        x < selection.x + selection.width &&
        y < selection.y + selection.height
      )
        drag.current = { x, y, start, last: [x, y], moved: selection };
      else {
        setSelection(null);
        drag.current = { x, y, start, last: [x, y] };
      }
      return;
    }
    if (tool === "fill") {
      commit("Fill", start, setFrame(start, shown, fill(current(), x, y, paintColor)));
      return;
    }
    drag.current = { x, y, start, last: [x, y] };
    if (tool === "pencil" || tool === "eraser") setDoc(setFrame(start, shown, pencil(current(), x, y, paintColor)));
  };

  const onMove = (e: React.PointerEvent) => {
    const tool = toolRef.current;
    const paintColor = paint();
    const d = drag.current;
    if (!d) return;
    const [x, y] = cell(e);
    if (x === d.last[0] && y === d.last[1]) return;
    const base = d.start.frames[shown] as Frame;
    if (tool === "pencil" || tool === "eraser") {
      setDoc(setFrame(docRef.current, shown, line(current(), d.last[0], d.last[1], x, y, paintColor)));
    } else if (tool === "line") setPreview(line(base, d.x, d.y, x, y, paintColor));
    else if (tool === "rect" || tool === "rectFill")
      setPreview(rect(base, rectBetween(d.x, d.y, x, y), paintColor, tool === "rectFill"));
    else if (tool === "select") {
      if (d.moved) {
        const m = moveRegion(base, d.moved, x - d.x, y - d.y);
        setPreview(m.frame);
        setSelection(m.rect);
      } else setSelection(clip(base, rectBetween(d.x, d.y, x, y)));
    }
    d.last = [x, y];
  };

  const onUp = () => {
    const tool = toolRef.current;
    const pv = previewRef.current;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const labels: Record<Tool, string> = {
      pencil: "Draw",
      eraser: "Erase",
      line: "Line",
      rect: "Rectangle",
      rectFill: "Filled Rectangle",
      fill: "Fill",
      select: "Move",
    };
    if (pv) {
      commit(labels[tool], d.start, setFrame(d.start, shown, pv));
      setPreview(null);
    } else if (tool === "pencil" || tool === "eraser") {
      // The stroke was applied live; record it as one undo step from where it started.
      const after = docRef.current;
      docRef.current = d.start;
      commit(labels[tool], d.start, after);
    }
  };

  const addColor = (hex: string) => {
    const ds = hexToDs(hex);
    if (ds === null) return;
    const r = paletteIndex(docRef.current, ds, limit);
    if (r.index < 0) {
      host.toast(
        isSprite
          ? `This sprite already has ${limit} colours (the most its colour mode allows).`
          : `This background already has ${limit - 1} colours (the most the DS allows).`,
        "error",
      );
      return;
    }
    commit("Add Colour", docRef.current, r.doc);
    setColor(r.index);
  };

  const frameOp = (label: string, next: SpriteDoc, select: number) => {
    commit(label, docRef.current, next);
    setFrameIndex(Math.max(0, Math.min(select, next.frames.length - 1)));
    setSelection(null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const t = TOOLS.find(([, , key]) => key.toLowerCase() === (e.shiftKey && k === "r" ? "shift+r" : k));
    if (t) {
      setTool(t[0]);
      e.preventDefault();
      return;
    }
    if (selection && (e.key === "Delete" || e.key === "Backspace")) {
      commit("Delete", docRef.current, setFrame(docRef.current, shown, rect(current(), selection, 0, true)));
      e.preventDefault();
    } else if (selection && e.key.startsWith("Arrow")) {
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      const m = moveRegion(current(), selection, dx, dy);
      commit("Move", docRef.current, setFrame(docRef.current, shown, m.frame));
      setSelection(m.rect);
      e.preventDefault();
    }
  };

  const used = colorsUsed(doc);
  return (
    <div
      ref={root}
      className="sprite-editor"
      role="application"
      aria-label={`${isSprite ? "Sprite" : "Background"} editor: ${name}`}
      tabIndex={-1}
      data-testid={`${variant}-editor:${name}`}
      onKeyDown={onKey}
    >
      <div className="se-toolbar" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map(([t, label, key]) => (
          <button
            key={t}
            type="button"
            className={tool === t ? "active" : ""}
            aria-pressed={tool === t}
            title={`${label} (${key})`}
            data-testid={`tool:${t}`}
            onClick={() => setTool(t)}
          >
            {label}
          </button>
        ))}
        <span className="se-gap" />
        <button
          type="button"
          title="Mirror left and right (the selection, or the whole frame)"
          data-testid="mirror-h"
          onClick={() =>
            commit(
              "Mirror",
              docRef.current,
              setFrame(docRef.current, shown, mirror(current(), "horizontal", selection ?? undefined)),
            )
          }
        >
          Mirror {"↔"}
        </button>
        <button
          type="button"
          title="Mirror top and bottom"
          data-testid="mirror-v"
          onClick={() =>
            commit(
              "Mirror",
              docRef.current,
              setFrame(docRef.current, shown, mirror(current(), "vertical", selection ?? undefined)),
            )
          }
        >
          Mirror {"↕"}
        </button>
        {isSprite ? (
          <label>
            <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} data-testid="onion" />{" "}
            Onion skin
          </label>
        ) : null}
        {highlightTiles ? (
          <label title="Tiles used only once: each costs a tile of its own. Repeat or simplify them to use fewer.">
            <input
              type="checkbox"
              checked={showTiles}
              onChange={(e) => setShowTiles(e.target.checked)}
              data-testid="show-tiles"
            />{" "}
            One-off tiles
          </label>
        ) : null}
        <label>
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid
        </label>
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 1))} aria-label="Zoom out">
          -
        </button>
        <span className="se-zoom">{zoom}x</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(48, z + 1))} aria-label="Zoom in">
          +
        </button>
      </div>
      <div className="se-body">
        <div className="se-palette" data-testid="palette">
          {doc.palette.map((ds, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: palette slots are positional.
              key={i}
              type="button"
              className={`se-swatch${i === color ? " active" : ""}${i === 0 ? " transparent" : ""}`}
              style={i === 0 ? undefined : { background: dsToHex(ds) }}
              title={i === 0 ? "Transparent" : dsToHex(ds)}
              data-testid={`swatch:${i}`}
              onClick={() => {
                setColor(i);
                if (tool === "eraser" || tool === "select") setTool("pencil");
              }}
            />
          ))}
          <label className="se-add-color" title="Add a colour">
            +
            <input type="color" onChange={(e) => addColor(e.target.value)} data-testid="add-color" />
          </label>
          <p
            className={`se-colors${used > limit - 1 ? " over" : ""}`}
            title="Index 0 is transparent and does not count"
          >
            {used} colour{used === 1 ? "" : "s"}
            {isSprite ? (used <= 15 ? " (fits 16-colour mode)" : " (needs 256-colour mode)") : ` of ${limit - 1}`}
          </p>
          {aside?.(doc)}
        </div>
        <div className="se-canvas-wrap">
          <div className="se-canvas" style={{ width: doc.frameWidth * zoom, height: doc.frameHeight * zoom }}>
            <canvas ref={canvas} className="pixelated" />
            <canvas
              ref={overlay}
              className="se-overlay"
              data-testid={`${variant}-canvas`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
          </div>
        </div>
      </div>
      {isSprite ? (
        <div className="se-strip" data-testid="frame-strip">
          {doc.frames.map((f, i) => (
            <FrameThumb
              // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional in the strip.
              key={i}
              doc={doc}
              index={i}
              frame={f}
              active={i === shown}
              onClick={() => {
                setFrameIndex(i);
                setSelection(null);
              }}
            />
          ))}
          <div className="se-strip-buttons">
            <button
              type="button"
              data-testid="frame-add"
              onClick={() => frameOp("Add Frame", addFrame(docRef.current, shown, false), shown + 1)}
            >
              + Frame
            </button>
            <button
              type="button"
              data-testid="frame-copy"
              onClick={() => frameOp("Copy Frame", addFrame(docRef.current, shown, true), shown + 1)}
            >
              Copy
            </button>
            <button
              type="button"
              data-testid="frame-delete"
              disabled={frameCount <= 1}
              onClick={() => frameOp("Delete Frame", deleteFrame(docRef.current, shown), shown - 1)}
            >
              Delete
            </button>
            <button
              type="button"
              disabled={shown === 0}
              onClick={() => frameOp("Move Frame", moveFrame(docRef.current, shown, shown - 1), shown - 1)}
              aria-label="Move frame left"
            >
              {"←"}
            </button>
            <button
              type="button"
              disabled={shown === frameCount - 1}
              onClick={() => frameOp("Move Frame", moveFrame(docRef.current, shown, shown + 1), shown + 1)}
              aria-label="Move frame right"
            >
              {"→"}
            </button>
          </div>
          <div className="se-anim">
            <canvas ref={animCanvas} className="pixelated" data-testid="anim-preview" />
            <button type="button" data-testid="anim-play" onClick={() => setPlaying(!playing)}>
              {playing ? "Stop" : "▶ Animate"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FrameThumb({
  doc,
  index,
  frame,
  active,
  onClick,
}: {
  doc: SpriteDoc;
  index: number;
  frame: Frame;
  active: boolean;
  onClick: () => void;
}) {
  const c = useRef<HTMLCanvasElement>(null);
  const zoom = Math.max(1, Math.floor(48 / Math.max(doc.frameWidth, doc.frameHeight)));
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw when this frame's pixels or the palette change.
  useEffect(() => drawFrame(c.current, doc, index, zoom, false), [frame, doc.palette, zoom, index]);
  return (
    <button
      type="button"
      className={`se-thumb${active ? " active" : ""}`}
      data-testid={`frame:${index}`}
      onClick={onClick}
    >
      <canvas ref={c} className="pixelated" />
      <span>{index}</span>
    </button>
  );
}

/**
 * The sprite's memory on its screen, live: frames x the padded OBJ frame, as the pipeline stores it (C13
 * objVramBytesPerScreen). Plain words; the OBJ size and colour depth are in the tooltip.
 */
export function SpriteMeters({ doc, colorMode }: { doc: SpriteDoc; colorMode: SpriteJson["colorMode"] }) {
  const mode = colorMode !== "auto" ? colorMode : colorsUsed(doc) <= 15 ? "16" : "256";
  const padded = paddedFrame(doc.frameWidth, doc.frameHeight);
  if (!padded)
    return (
      <p className="meter meter-over sprite-meter" data-testid="sprite-meter:memory">
        Frames bigger than 64x64 cannot be DS sprites
      </p>
    );
  const frames = doc.frames.length;
  const bytes = spriteBytes({ frames, frameWidth: doc.frameWidth, frameHeight: doc.frameHeight, colorMode: mode });
  const max = BUDGET_LIMITS.objVramBytesPerScreen;
  const pads = padded.width !== doc.frameWidth || padded.height !== doc.frameHeight;
  return (
    <>
      <p
        className={`meter meter-${budgetLevel(bytes, max)} sprite-meter`}
        data-testid="sprite-meter:memory"
        title={`OBJ VRAM: ${frames} frame${frames === 1 ? "" : "s"} of ${padded.width}x${padded.height} at ${mode === "16" ? "4" : "8"} bits per pixel, 128-byte aligned, out of ${kb(max)} per screen.`}
      >
        Memory: {kb(bytes)} of {kb(max)}
      </p>
      {pads ? (
        <p className="sprite-meter-hint" data-testid="sprite-meter:padding">
          Each frame is stored as {padded.width}x{padded.height} on the DS.
        </p>
      ) : null}
    </>
  );
}

/** The sprite editor's C12 factory (default export: the shell loads editors/<name>/index.tsx). */
const spriteEditorFactory: EditorPanelFactory = {
  kind: "sprite",
  canOpen: (r) => r.kind === "sprite",
  create({ element, host }): EditorPanel {
    const root = createRoot(element);
    const listeners = new Set<(dirty: boolean) => void>();
    let resource: ResourceRef = { kind: "sprite", name: "" };
    let saved: SpriteDoc | null = null;
    let doc: SpriteDoc | null = null;
    const report = () => {
      const dirty = doc !== null && saved !== null && !sameSprite(doc, saved);
      for (const l of listeners) l(dirty);
    };
    return {
      get id() {
        return `sprite:${resource.name}`;
      },
      kind: "sprite",
      async open(r) {
        resource = r;
        const json = host.project.get()?.sprites.find((s) => s.name === r.name);
        if (!json) throw new Error(`${r.name} is not in this project`);
        const png = await host.files.read(`sprites/${r.name}/sheet.png`);
        const preview = previewSprite(png, {
          frameWidth: json.frameWidth,
          frameHeight: json.frameHeight,
          colorMode: json.colorMode,
          transparent: json.transparent as "alpha" | `#${string}`,
        });
        saved = spriteDocFromPreview(preview, json.frameWidth, json.frameHeight);
        doc = saved;
        root.render(
          <SpriteEditor
            host={host}
            name={r.name}
            initial={saved}
            aside={(d) => <SpriteMeters doc={d} colorMode={json.colorMode} />}
            onChange={(d) => {
              doc = d;
              report();
            }}
          />,
        );
      },
      async save() {
        if (!doc || !saved || sameSprite(doc, saved)) return;
        const { width, height, indices } = sheetIndices(doc);
        await host.files.write(
          `sprites/${resource.name}/sheet.png`,
          encodeDsIndexedPng(width, height, indices, doc.palette),
        );
        const frames = doc.frames.length;
        const json = host.project.get()?.sprites.find((s) => s.name === resource.name);
        if (json && json.frames !== frames)
          host.project.update(resource, (d) => {
            const s = d.sprites.find((x) => x.name === resource.name);
            if (s) s.frames = frames;
          });
        saved = doc;
        report();
      },
      dispose() {
        root.unmount();
      },
      onDirty(l) {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
    };
  },
};

export default spriteEditorFactory;
