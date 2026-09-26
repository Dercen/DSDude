/**
 * Import dialogs (PLAN.md 6 WS6): a picked PNG becomes a sprite (editable frame count, animated DS preview from
 * C12 previewSprite, an origin picker) or a background; a picked sound becomes an effect or music (WAV/MP3 preview
 * through Web Audio). The DS conversion runs here, on the picked file's bytes (C5 dialog.readPicked).
 */
import {
  decodePng,
  previewSpriteDetails,
  type RgbaImage,
  type SpritePreviewDetails,
  spriteDefaults,
} from "@dsdude/asset-pipeline/browser";
import { NAME, type SpriteJson } from "@dsdude/project-format";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActions, useIde } from "../ide-context.tsx";
import { ipc, parseIpcError } from "../ipc.ts";
import type { ImportKind } from "../store/ide.ts";

const PREFIX: Record<ImportKind, string> = { sprite: "spr_", background: "bg_", sound: "snd_" };

/** A C1 name from a file name: "Bird Flap.png" -> "spr_bird_flap", unique among `taken`. */
export function suggestName(file: string, kind: ImportKind, taken: ReadonlySet<string>): string {
  const base = (file.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  let name = base.startsWith(PREFIX[kind]) ? base : `${PREFIX[kind]}${base || "new"}`;
  if (!NAME.test(name)) name = `${PREFIX[kind]}new`;
  let n = 2;
  let unique = name;
  while (taken.has(unique)) unique = `${name}_${n++}`;
  return unique;
}

function drawImage(canvas: HTMLCanvasElement | null, img: RgbaImage, sx: number, sw: number, zoom: number): void {
  if (!canvas) return;
  canvas.width = sw * zoom;
  canvas.height = img.height * zoom;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const frame = new ImageData(sw, img.height);
  for (let y = 0; y < img.height; y++)
    frame.data.set(img.rgba.subarray((y * img.width + sx) * 4, (y * img.width + sx + sw) * 4), y * sw * 4);
  const tmp = document.createElement("canvas");
  tmp.width = sw;
  tmp.height = img.height;
  tmp.getContext("2d")?.putImageData(frame, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, sw * zoom, img.height * zoom);
}

function SpriteSettings({
  bytes,
  onChange,
}: {
  bytes: Uint8Array;
  onChange: (json: SpriteJson | null, problems: string[]) => void;
}) {
  const image = useMemo(() => decodePng(bytes), [bytes]);
  const defaults = useMemo(() => spriteDefaults(image), [image]);
  const [frames, setFrames] = useState(defaults.frames);
  const [colorMode, setColorMode] = useState<"auto" | "16" | "256">("auto");
  const [origin, setOrigin] = useState(defaults.origin);
  const frameWidth = Math.max(1, Math.floor(image.width / Math.max(1, frames)));
  const frameHeight = image.height;
  const details: SpritePreviewDetails | null = useMemo(() => {
    try {
      return previewSpriteDetails(bytes, { frameWidth, frameHeight, colorMode, transparent: "alpha" });
    } catch {
      return null;
    }
  }, [bytes, frameWidth, frameHeight, colorMode]);
  const zoom = Math.max(1, Math.min(8, Math.floor(160 / Math.max(frameWidth, frameHeight))));
  const anim = useRef<HTMLCanvasElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 125);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (details) drawImage(anim.current, details.converted, (tick % frames) * frameWidth, frameWidth, zoom);
  }, [details, tick, frames, frameWidth, zoom]);
  useEffect(() => {
    if (!details || !still.current) return;
    drawImage(still.current, details.original, 0, frameWidth, zoom);
    const ctx = still.current.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#ff3b3b";
    ctx.beginPath();
    ctx.moveTo((origin.x + 0.5) * zoom, 0);
    ctx.lineTo((origin.x + 0.5) * zoom, frameHeight * zoom);
    ctx.moveTo(0, (origin.y + 0.5) * zoom);
    ctx.lineTo(frameWidth * zoom, (origin.y + 0.5) * zoom);
    ctx.stroke();
  }, [details, origin, frameWidth, frameHeight, zoom]);

  const bbox =
    frames === defaults.frames ? defaults.bbox : { left: 0, top: 0, right: frameWidth - 1, bottom: frameHeight - 1 };
  const problems = [
    ...(image.width % frames !== 0
      ? [`The picture is ${image.width} pixels wide, which is not ${frames} equal frames.`]
      : []),
    ...(details?.diagnostics.map((d) => `${d.message}${d.hint ? ` ${d.hint}` : ""}`) ?? [
      "This PNG could not be read.",
    ]),
  ];
  const json: SpriteJson | null = details
    ? {
        frames,
        frameWidth,
        frameHeight,
        origin: { x: Math.min(origin.x, frameWidth - 1), y: Math.min(origin.y, frameHeight - 1) },
        bbox,
        colorMode,
        transparent: "alpha",
      }
    : null;
  const key = JSON.stringify([json, problems]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: report when the settings (key) change.
  useEffect(() => onChange(json, problems), [key]);

  return (
    <div className="import-sprite">
      <div className="import-fields">
        <label className="field">
          Frames
          <input
            type="number"
            min={1}
            max={image.width}
            value={frames}
            data-testid="import-frames"
            onChange={(e) => setFrames(Math.max(1, Math.min(image.width, Number(e.target.value) || 1)))}
          />
        </label>
        <p className="field-hint">
          {frames} frame{frames === 1 ? "" : "s"} of {frameWidth}x{frameHeight} pixels
          {details ? `, ${details.preview.colorCount - 1} colours (${details.preview.colorMode}-colour mode)` : ""}
        </p>
        <label className="field">
          Colours
          <select value={colorMode} onChange={(e) => setColorMode(e.target.value as "auto" | "16" | "256")}>
            <option value="auto">Automatic</option>
            <option value="16">16 colours</option>
            <option value="256">256 colours</option>
          </select>
        </label>
        <div className="field">
          Origin
          <span className="field-row">
            <button type="button" onClick={() => setOrigin({ x: 0, y: 0 })}>
              Top left
            </button>
            <button
              type="button"
              onClick={() => setOrigin({ x: Math.floor(frameWidth / 2), y: Math.floor(frameHeight / 2) })}
            >
              Centre
            </button>
            <button type="button" onClick={() => setOrigin({ x: Math.floor(frameWidth / 2), y: frameHeight - 1 })}>
              Bottom
            </button>
          </span>
          <span className="field-hint">
            ({origin.x}, {origin.y}): the point x and y refer to. Click the picture to move it.
          </span>
        </div>
      </div>
      <div className="import-previews">
        <figure>
          <canvas
            ref={still}
            className="pixelated"
            data-testid="import-origin"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setOrigin({
                x: Math.min(frameWidth - 1, Math.floor((e.clientX - r.left) / zoom)),
                y: Math.min(frameHeight - 1, Math.floor((e.clientY - r.top) / zoom)),
              });
            }}
          />
          <figcaption>Your picture (first frame)</figcaption>
        </figure>
        <figure>
          <canvas ref={anim} className="pixelated" data-testid="import-preview" />
          <figcaption>On the DS</figcaption>
        </figure>
      </div>
      {problems.length > 0 ? (
        <ul className="import-problems" data-testid="import-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PicturePreview({ bytes }: { bytes: Uint8Array }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useMemo(() => {
    try {
      return decodePng(bytes);
    } catch {
      return null;
    }
  }, [bytes]);
  useEffect(() => {
    if (image) drawImage(canvas.current, image, 0, image.width, image.width > 256 ? 1 : 2);
  }, [image]);
  if (!image) return <p className="field-error">This PNG could not be read.</p>;
  return (
    <figure>
      <canvas ref={canvas} className="pixelated import-background" />
      <figcaption>
        {image.width}x{image.height} pixels
      </figcaption>
    </figure>
  );
}

function SoundPreview({ bytes, path }: { bytes: Uint8Array; path: string }) {
  const [state, setState] = useState<"idle" | "playing" | "unsupported">(
    /\.(wav|mp3)$/i.test(path) ? "idle" : "unsupported",
  );
  const play = async () => {
    try {
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.onended = () => {
        setState("idle");
        void ctx.close();
      };
      setState("playing");
      src.start();
    } catch {
      setState("unsupported");
    }
  };
  if (state === "unsupported") return <p className="field-hint">The preview plays WAV and MP3 files.</p>;
  return (
    <button type="button" data-testid="import-play" disabled={state === "playing"} onClick={() => void play()}>
      {state === "playing" ? "Playing…" : "▶ Listen"}
    </button>
  );
}

export function ImportDialog() {
  const importing = useIde((s) => s.importing);
  const project = useIde((s) => s.project);
  const actions = useActions();
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [name, setName] = useState("");
  const [sprite, setSprite] = useState<{ json: SpriteJson | null; problems: string[] }>({ json: null, problems: [] });
  const [soundKind, setSoundKind] = useState<"effect" | "music">("effect");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const taken = useMemo(
    () =>
      new Set(
        project
          ? [
              project.sprites,
              project.backgrounds,
              project.sounds,
              project.objects,
              project.rooms,
              project.scripts,
            ].flatMap((l) => l.map((r) => r.name))
          : [],
      ),
    [project],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset once per picked file.
  useEffect(() => {
    setBytes(null);
    setError(null);
    if (!importing) return;
    setName(suggestName(importing.sourcePath, importing.kind, taken));
    setSoundKind(/\.(xm|mod|it|s3m)$/i.test(importing.sourcePath) ? "music" : "effect");
    ipc.invoke("dialog.readPicked", { path: importing.sourcePath }).then(
      (r) => setBytes(r.bytes),
      (err: unknown) => setError(parseIpcError(err).message),
    );
  }, [importing]);

  if (!importing) return null;
  const { kind, sourcePath } = importing;
  const nameProblem = !NAME.test(name)
    ? "Use letters, digits and _, starting with a letter or _."
    : taken.has(name)
      ? `Something in this project is already called ${name}.`
      : null;
  const canImport = bytes !== null && !nameProblem && !busy && (kind !== "sprite" || sprite.json !== null);

  const run = async () => {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    try {
      await actions.importAsset({
        kind,
        sourcePath,
        name,
        ...(kind === "sprite" && sprite.json ? { sprite: sprite.json } : {}),
        ...(kind === "sound" ? { sound: { kind: soundKind } } : {}),
      });
    } catch (err) {
      setError(parseIpcError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <form
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        data-testid="import-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") actions.cancelImport();
        }}
      >
        <h2 id="import-title">Import a {kind}</h2>
        <p className="field-hint">{sourcePath}</p>
        <label className="field">
          Name
          <input data-testid="import-name" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
        </label>
        {nameProblem ? <p className="field-error">{nameProblem}</p> : null}
        {bytes === null && !error ? <p>Reading the file…</p> : null}
        {bytes && kind === "sprite" ? (
          <SpriteSettings bytes={bytes} onChange={(json, problems) => setSprite({ json, problems })} />
        ) : null}
        {bytes && kind === "background" ? <PicturePreview bytes={bytes} /> : null}
        {bytes && kind === "sound" ? (
          <>
            <label className="field">
              Kind
              <select
                value={soundKind}
                data-testid="import-sound-kind"
                onChange={(e) => setSoundKind(e.target.value as "effect" | "music")}
              >
                <option value="effect">Sound effect (plays on top of everything)</option>
                <option value="music">Music (one track at a time)</option>
              </select>
            </label>
            <SoundPreview bytes={bytes} path={sourcePath} />
          </>
        ) : null}
        {error ? (
          <p className="field-error" data-testid="import-error">
            {error}
          </p>
        ) : null}
        <div className="dialog-buttons">
          <button type="button" onClick={() => actions.cancelImport()}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!canImport} data-testid="import-ok">
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </form>
    </div>
  );
}
