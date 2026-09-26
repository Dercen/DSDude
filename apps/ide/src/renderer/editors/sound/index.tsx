/**
 * The sound panel (PLAN.md 6 WS6b, done by WS6): a C12 EditorPanel for sounds. Its kind (effect or music), a
 * waveform, a Listen button (Web Audio, looping over the loop when there is one) and, for WAV effects, loop points
 * stored in the WAV's `smpl` chunk where the asset pipeline reads them. Plain language on screen; the DS figures
 * (22050 Hz cap, loops of at least 16 samples) come from @dsdude/editor-core `dsLoop`, and hardware terms stay in
 * tooltips. New sounds come in through the import dialog (the '+' on the Sounds heading).
 */
import {
  clampLoop,
  DS_MAX_RATE,
  dsLoop,
  type Loop,
  MIN_LOOP_SAMPLES,
  peaks,
  type WavInfo,
  wavInfo,
  withLoop,
} from "@dsdude/editor-core";
import type { Project } from "@dsdude/project-format";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { EditorPanel, EditorPanelFactory, PanelHost, ResourceRef } from "../../panels/api.ts";
import { updateWithUndo } from "../../panels/kit.ts";

const WAVE_WIDTH = 720;
const WAVE_HEIGHT = 120;

const sameLoop = (a: Loop | null, b: Loop | null) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end);

function useProject(host: PanelHost): Project | null {
  return useSyncExternalStore((cb) => host.project.subscribe(() => cb()), host.project.get);
}

/** Decodes at the file's own rate, so buffer frames are the file's samples. */
async function decode(bytes: Uint8Array, rate: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, rate);
  return ctx.decodeAudioData(bytes.slice().buffer);
}

function mono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (ch[i] as number) / buffer.numberOfChannels;
  }
  return out;
}

function describe(info: WavInfo | null, buffer: AudioBuffer | null, ext: string): string {
  const rate = info?.sampleRate ?? buffer?.sampleRate;
  const channels = info?.channels ?? buffer?.numberOfChannels;
  const seconds = info && info.sampleRate > 0 ? info.frames / info.sampleRate : buffer?.duration;
  return [
    ext.toUpperCase(),
    rate ? `${rate} Hz` : null,
    channels ? (channels === 1 ? "mono" : channels === 2 ? "stereo" : `${channels} channels`) : null,
    seconds !== undefined ? `${seconds.toFixed(2)} s` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function SoundPanel({
  host,
  name,
  bytes,
  initialLoop,
  onLoop,
}: {
  host: PanelHost;
  name: string;
  bytes: Uint8Array;
  initialLoop: Loop | null;
  onLoop: (loop: Loop | null) => void;
}) {
  const project = useProject(host);
  const json = project?.sounds.find((s) => s.name === name);
  const ext = (/\.([a-z0-9]+)$/i.exec(json?.file ?? "")?.[1] ?? "").toLowerCase();
  const info = ext === "wav" ? wavInfo(bytes) : null;
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [loop, setLoopState] = useState<Loop | null>(initialLoop);
  const loopRef = useRef(initialLoop);
  const [draft, setDraftState] = useState<Loop | null>(null);
  // Pointer handlers read the dragged loop from here: events can arrive before React re-renders.
  const draftRef = useRef<Loop | null>(null);
  const setDraft = (l: Loop | null) => {
    draftRef.current = l;
    setDraftState(l);
  };
  const [playing, setPlaying] = useState<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  const frames = info?.frames ?? buffer?.length ?? 0;
  const rate = info?.sampleRate ?? buffer?.sampleRate ?? 0;
  const canLoop = !!info && info.formatTag === 1 && frames > 0 && json?.kind === "effect";
  const decodable = ext === "wav" || ext === "mp3";

  const setLoop = (l: Loop | null) => {
    loopRef.current = l;
    setLoopState(l);
    onLoop(l);
  };
  const commit = (label: string, after: Loop | null) => {
    const before = loopRef.current;
    if (sameLoop(before, after)) return;
    setLoop(after);
    host.undo.push({ label, undo: () => setLoop(before), redo: () => setLoop(after) });
  };

  useEffect(() => {
    if (!decodable) return;
    let live = true;
    decode(bytes, info?.sampleRate || 44100)
      .then((b) => live && setBuffer(b))
      .catch(() => live && setDecodeFailed(true));
    return () => {
      live = false;
    };
  }, [bytes, decodable, info?.sampleRate]);

  useEffect(() => () => void playing?.ctx.close(), [playing]);

  // Waveform with the loop (or the loop being dragged) shaded.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const shown = draft ?? loop;
    if (shown && frames > 0) {
      ctx.fillStyle = "rgba(55,148,255,0.25)";
      const x0 = (shown.start / frames) * c.width;
      const x1 = (shown.end / frames) * c.width;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), c.height);
      ctx.fillStyle = "#3794ff";
      ctx.fillRect(x0, 0, 1, c.height);
      ctx.fillRect(Math.max(0, x1 - 1), 0, 1, c.height);
    }
    if (!buffer) return;
    const p = peaks(mono(buffer), c.width);
    const mid = c.height / 2;
    ctx.fillStyle = "#b4d27a";
    for (let x = 0; x < c.width; x++) {
      const lo = p[x * 2] as number;
      const hi = p[x * 2 + 1] as number;
      ctx.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
    }
  }, [buffer, loop, draft, frames]);

  const sampleAt = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.round(((e.clientX - r.left) / r.width) * frames);
  };
  const onDown = (e: React.PointerEvent) => {
    if (!canLoop) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events (tests) have no active pointer to capture
    }
    drag.current = sampleAt(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current === null) return;
    const s = sampleAt(e);
    setDraft(clampLoop({ start: Math.min(drag.current, s), end: Math.max(drag.current, s) }, frames));
  };
  const onUp = () => {
    const d = draftRef.current;
    drag.current = null;
    setDraft(null);
    if (d && d.end - d.start > 1) commit("Set Loop", d);
  };

  const play = async () => {
    if (playing) {
      playing.src.stop();
      setPlaying(null);
      return;
    }
    if (!buffer) return;
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (loop && canLoop && rate > 0) {
        src.loop = true;
        src.loopStart = loop.start / rate;
        src.loopEnd = loop.end / rate;
      }
      src.connect(ctx.destination);
      src.onended = () => setPlaying((p) => (p?.src === src ? null : p));
      src.start();
      setPlaying({ ctx, src });
    } catch {
      host.toast("This sound cannot be played here.", "error");
    }
  };

  if (!json) return <div className="panel-empty">{name} is not in this project.</div>;
  const ds = loop && canLoop ? dsLoop(loop, rate, frames) : null;
  const setKind = (kind: "effect" | "music") =>
    updateWithUndo(host, { kind: "sound", name }, "Change Kind", (d) => {
      const s = d.sounds.find((x) => x.name === name);
      if (s) s.kind = kind;
    });

  return (
    <div className="sound-panel" data-testid={`sound-panel:${name}`}>
      <div className="se-toolbar" role="toolbar" aria-label="Sound">
        <label>
          Kind{" "}
          <select
            value={json.kind}
            onChange={(e) => setKind(e.target.value as "effect" | "music")}
            data-testid="sound-kind"
          >
            <option value="effect">Sound effect</option>
            <option value="music">Music</option>
          </select>
        </label>
        <button
          type="button"
          data-testid="sound-play"
          disabled={!buffer}
          onClick={() => void play()}
          title={loop && canLoop ? "Plays and repeats the loop until you stop it" : undefined}
        >
          {playing ? "■ Stop" : "▶ Listen"}
        </button>
        <span className="sound-info" data-testid="sound-info">
          sounds/{name}/{json.file}: {describe(info, buffer, ext)}
        </span>
      </div>
      {decodable ? (
        <canvas
          ref={canvas}
          width={WAVE_WIDTH}
          height={WAVE_HEIGHT}
          className="sound-wave"
          data-testid="sound-wave"
          title={canLoop ? "Drag across the wave to set the loop" : undefined}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      ) : (
        <p className="sound-note">
          Music modules (.xm, .mod, .it, .s3m) play in the game: press Play to hear this one. Their loops are set in the
          tracker that made them.
        </p>
      )}
      {decodeFailed ? <p className="sound-note">This file could not be read as audio.</p> : null}
      {decodable && json.kind === "effect" ? (
        canLoop ? (
          <LoopControls
            loop={loop}
            frames={frames}
            onCommit={commit}
            ds={ds}
            rate={rate}
            onLoopChange={(on) =>
              commit(on ? "Add Loop" : "Remove Loop", on ? clampLoop({ start: 0, end: frames }, frames) : null)
            }
          />
        ) : (
          <p className="sound-note">Loop points need a WAV file: convert this sound to WAV to make it repeat.</p>
        )
      ) : null}
    </div>
  );
}

function LoopControls({
  loop,
  frames,
  rate,
  ds,
  onCommit,
  onLoopChange,
}: {
  loop: Loop | null;
  frames: number;
  rate: number;
  ds: ReturnType<typeof dsLoop> | null;
  onCommit: (label: string, loop: Loop | null) => void;
  onLoopChange: (on: boolean) => void;
}) {
  const field = (label: string, key: "start" | "end") => (
    <label>
      {label}{" "}
      <input
        key={`${key}:${loop?.[key]}`}
        type="number"
        min={0}
        max={frames}
        defaultValue={loop?.[key]}
        disabled={!loop}
        data-testid={`loop-${key}`}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (loop && Number.isFinite(n) && n !== loop[key])
            onCommit("Set Loop", clampLoop({ ...loop, [key]: n }, frames));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
  return (
    <div className="sound-loop">
      <label title="The sound repeats between two points until the game stops it (a smpl loop in the WAV)">
        <input
          type="checkbox"
          checked={!!loop}
          onChange={(e) => onLoopChange(e.target.checked)}
          data-testid="loop-on"
        />{" "}
        Loop
      </label>
      {field("From sample", "start")}
      {field("to", "end")}
      {loop && rate > 0 ? (
        <span className="sound-loop-len">({((loop.end - loop.start) / rate).toFixed(3)} s)</span>
      ) : null}
      {ds ? (
        <p
          className={`sound-ds${ds.tooShort ? " meter-over" : ""}`}
          data-testid="loop-ds"
          title={`The DS plays effects at up to ${DS_MAX_RATE} Hz, so the loop is scaled to ${ds.rate} Hz; loops under ${MIN_LOOP_SAMPLES} samples are dropped (mmutil).`}
        >
          {ds.tooShort
            ? `Too short to loop on the DS: ${ds.length} samples at ${ds.rate} Hz, at least ${MIN_LOOP_SAMPLES} needed. It will play once.`
            : `On the DS: loops samples ${ds.loop?.start}..${ds.loop?.end} at ${ds.rate} Hz (${ds.length} samples).`}
        </p>
      ) : null}
    </div>
  );
}

/** The sound panel's C12 factory (default export: the shell loads editors/<name>/index.tsx). */
const soundPanelFactory: EditorPanelFactory = {
  kind: "sound",
  canOpen: (r) => r.kind === "sound",
  create({ element, host }): EditorPanel {
    const root = createRoot(element);
    const listeners = new Set<(dirty: boolean) => void>();
    let resource: ResourceRef = { kind: "sound", name: "" };
    let path = "";
    let bytes: Uint8Array | null = null;
    let saved: Loop | null = null;
    let loop: Loop | null = null;
    const report = () => {
      for (const l of listeners) l(!sameLoop(loop, saved));
    };
    return {
      get id() {
        return `sound:${resource.name}`;
      },
      kind: "sound",
      async open(r) {
        resource = r;
        const json = host.project.get()?.sounds.find((s) => s.name === r.name);
        if (!json) throw new Error(`${r.name} is not in this project`);
        path = `sounds/${r.name}/${json.file}`;
        bytes = await host.files.read(path);
        saved = /\.wav$/i.test(json.file) ? (wavInfo(bytes)?.loop ?? null) : null;
        loop = saved;
        root.render(
          <SoundPanel
            host={host}
            name={r.name}
            bytes={bytes}
            initialLoop={saved}
            onLoop={(l) => {
              loop = l;
              report();
            }}
          />,
        );
      },
      async save() {
        if (!bytes || sameLoop(loop, saved)) return;
        const next = withLoop(bytes, loop);
        if (!next) throw new Error(`${path} is not a WAV file`);
        await host.files.write(path, next);
        bytes = next;
        saved = loop;
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

export default soundPanelFactory;
