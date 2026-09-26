/**
 * The background editor (PLAN.md 6 WS6b, done by WS6): the pixel editor view over one 8bpp image, with the meters
 * a DS background needs (C13 `bgTilesMax` 1024 unique tiles, `bgMaxSize` 512 a side, 255 colours) computed as the
 * asset pipeline builds it (@dsdude/editor-core `backgroundStats`). Opens backgrounds/<name>/<file> through the
 * pipeline's 256-colour quantisation and saves a DS indexed PNG in its place.
 */
import { encodeDsIndexedPng } from "@dsdude/asset-pipeline/browser";
import {
  type BackgroundStats,
  BG_MAX_COLORS,
  backgroundDocFromPng,
  backgroundStats,
  oneOffTiles,
  type SpriteDoc,
  sameSprite,
} from "@dsdude/editor-core";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import type { EditorPanel, EditorPanelFactory, ResourceRef } from "../../panels/api.ts";
import { SpriteEditor } from "../sprite/index.tsx";

function level(value: number, max: number): "ok" | "warn" | "over" {
  return value > max ? "over" : value >= max * 0.9 ? "warn" : "ok";
}

const kb = (bytes: number) => `${Math.round(bytes / 102.4) / 10} KB`;

/** Plain-language meters; the hardware terms live in the tooltips. */
export function BackgroundMeters({ stats }: { stats: BackgroundStats }) {
  const side = Math.max(stats.width, stats.height);
  return (
    <div className="bg-meters" data-testid="bg-meters">
      <p
        className={`meter meter-${level(stats.tiles, stats.maxTiles)}`}
        data-testid="bg-meter:tiles"
        title={`Unique 8x8 tiles after merging flipped copies (grit -mRtf): the DS keeps at most ${stats.maxTiles} for a background. Tiles and map use ${kb(stats.vramBytes)} of BG VRAM.`}
      >
        Tiles: {stats.tiles}/{stats.maxTiles}
      </p>
      <p
        className={`meter meter-${stats.tooBig ? "over" : "ok"}`}
        data-testid="bg-meter:size"
        title={`Text backgrounds are 256 or 512 pixels a side; this one fills a ${stats.paddedWidth}x${stats.paddedHeight} map.`}
      >
        Size: {stats.width}x{stats.height}
        {side > stats.maxSize ? ` (at most ${stats.maxSize})` : ""}
      </p>
      {stats.tooManyTiles ? (
        <p className="bg-hint">
          Too detailed to build: repeat more of the picture, or tick One-off tiles to see where the tiles go.
        </p>
      ) : null}
      {stats.tooBig ? (
        <p className="bg-hint">Too big to build: make it at most {stats.maxSize} pixels a side.</p>
      ) : null}
    </div>
  );
}

function Aside({ doc }: { doc: SpriteDoc }) {
  const frame = doc.frames[0];
  const stats = useMemo(() => (frame ? backgroundStats(frame) : null), [frame]);
  return stats ? <BackgroundMeters stats={stats} /> : null;
}

const highlight = (doc: SpriteDoc) => (doc.frames[0] ? oneOffTiles(doc.frames[0]) : []);

/** The background editor's C12 factory (default export: the shell loads editors/<name>/index.tsx). */
const backgroundEditorFactory: EditorPanelFactory = {
  kind: "background",
  canOpen: (r) => r.kind === "background",
  create({ element, host }): EditorPanel {
    const root = createRoot(element);
    const listeners = new Set<(dirty: boolean) => void>();
    let resource: ResourceRef = { kind: "background", name: "" };
    let file = "background.png";
    let saved: SpriteDoc | null = null;
    let doc: SpriteDoc | null = null;
    const report = () => {
      const dirty = doc !== null && saved !== null && !sameSprite(doc, saved);
      for (const l of listeners) l(dirty);
    };
    return {
      get id() {
        return `background:${resource.name}`;
      },
      kind: "background",
      async open(r) {
        resource = r;
        const json = host.project.get()?.backgrounds.find((b) => b.name === r.name);
        if (!json) throw new Error(`${r.name} is not in this project`);
        file = json.file;
        saved = backgroundDocFromPng(await host.files.read(`backgrounds/${r.name}/${file}`));
        doc = saved;
        root.render(
          <SpriteEditor
            host={host}
            name={r.name}
            initial={saved}
            variant="background"
            colorLimit={BG_MAX_COLORS + 1}
            aside={(d) => <Aside doc={d} />}
            highlightTiles={highlight}
            onChange={(d) => {
              doc = d;
              report();
            }}
          />,
        );
      },
      async save() {
        const frame = doc?.frames[0];
        if (!doc || !saved || !frame || sameSprite(doc, saved)) return;
        await host.files.write(
          `backgrounds/${resource.name}/${file}`,
          encodeDsIndexedPng(frame.width, frame.height, frame.pixels, doc.palette),
        );
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

export default backgroundEditorFactory;
