/**
 * Property forms for Game Settings, sprites, backgrounds, sounds and rooms: a C12 EditorPanel that makes every
 * resource type editable and savable through C1 (project.save). It is the fallback: registered after the editor
 * modules, so WS6b's visual editors win for the kinds they open. Every change is checked against the C1 schema
 * before it reaches the store, and is undoable (immer patches).
 */
import {
  type Project,
  ProjectJsonSchema,
  RoomJsonSchema,
  SoundJsonSchema,
  SpriteJsonSchema,
} from "@dsdude/project-format";
import type { Draft } from "immer";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { EditorPanel, EditorPanelFactory, PanelHost, ResourceRef } from "../panels/api.ts";
import { updateWithUndo } from "../panels/kit.ts";

interface Issue {
  code?: string;
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
}
type Z = { safeParse(v: unknown): { success: boolean; error?: { issues: Issue[] } } };

/** A zod issue in plain words (the schemas' own custom messages are already plain). */
export function plainIssue(issue: Issue | undefined): string {
  if (!issue) return "That value is not allowed.";
  const text = issue.origin === "string";
  if (issue.code === "too_small" && issue.minimum !== undefined)
    return text
      ? `Use at least ${issue.minimum} character${Number(issue.minimum) === 1 ? "" : "s"}.`
      : `Use ${issue.minimum} or more.`;
  if (issue.code === "too_big" && issue.maximum !== undefined)
    return text ? `Use ${issue.maximum} characters or fewer.` : `Use ${issue.maximum} or less.`;
  if (issue.code === "invalid_type" || issue.code === "invalid_value" || issue.code === "invalid_union")
    return "That value is not allowed.";
  return issue.message;
}

function useProject(host: PanelHost): Project | null {
  return useSyncExternalStore((cb) => host.project.subscribe(() => cb()), host.project.get);
}

/** A text or number input that commits on Enter or blur; Escape restores the stored value. */
function Field({
  label,
  value,
  onCommit,
  type = "text",
  hint,
  testId,
}: {
  label: string;
  value: string | number;
  onCommit: (v: string) => string | null;
  type?: "text" | "number";
  hint?: string;
  testId: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(String(value));
    setError(null);
  }, [value]);
  const commit = () => {
    if (draft === String(value)) return;
    const problem = onCommit(draft);
    setError(problem);
  };
  return (
    <label className="pf-field" title={hint}>
      <span className="pf-label">{label}</span>
      <input
        type={type}
        value={draft}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(value));
            setError(null);
          }
        }}
      />
      {error ? <span className="pf-error">{error}</span> : null}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  hint,
  testId,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  hint?: string;
  testId: string;
}) {
  return (
    <label className="pf-field" title={hint}>
      <span className="pf-label">{label}</span>
      <select value={value} data-testid={testId} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

const int = (s: string): number | null => (/^-?\d+$/.test(s.trim()) ? Number.parseInt(s, 10) : null);

/**
 * Applies `change` to a copy of the resource's JSON, validates it with `schema`, then records it (undoable).
 * Returns a plain-language problem, or null when the change was applied.
 */
function makeEditor<T>(
  host: PanelHost,
  resource: ResourceRef,
  schema: Z,
  pick: (d: Draft<Project>) => T | undefined,
  json: (t: T) => unknown,
) {
  return (label: string, change: (t: T) => void): string | null => {
    const current = host.project.get();
    if (!current) return "No project is open.";
    let problem: string | null = null;
    // Dry run on a structured copy to validate before touching the store.
    const copy = structuredClone(current) as Draft<Project>;
    const target = pick(copy);
    if (!target) return `${resource.name} is not in this project.`;
    change(target);
    const res = schema.safeParse(json(target));
    if (!res.success) problem = plainIssue(res.error?.issues[0]);
    if (problem) return problem;
    updateWithUndo(host, resource, label, (d) => {
      const t = pick(d);
      if (t) change(t);
    });
    return null;
  };
}

const without = <T extends { name: string }>({ name: _n, ...rest }: T) => rest;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="pf-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function numberField<T>(
  label: string,
  value: number,
  edit: (label: string, change: (t: T) => void) => string | null,
  set: (t: T, n: number) => void,
  testId: string,
  hint?: string,
) {
  return (
    <Field
      label={label}
      type="number"
      value={value}
      hint={hint}
      testId={testId}
      onCommit={(v) => {
        const n = int(v);
        return n === null ? "Use a whole number." : edit(`Change ${label}`, (t) => set(t, n));
      }}
    />
  );
}

function SettingsForm({ host, project }: { host: PanelHost; project: Project }) {
  const res: ResourceRef = { kind: "settings", name: "" };
  const edit = makeEditor(
    host,
    res,
    ProjectJsonSchema,
    (d) => d.project,
    (p) => p,
  );
  const p = project.project;
  const move = (i: number, by: number) =>
    updateWithUndo(host, res, "Reorder Rooms", (d) => {
      const j = i + by;
      if (j < 0 || j >= d.project.rooms.length) return;
      const rooms = d.project.rooms;
      [rooms[i], rooms[j]] = [rooms[j] as string, rooms[i] as string];
      d.rooms.sort((a, b) => rooms.indexOf(a.name) - rooms.indexOf(b.name));
    });
  return (
    <>
      <Section title="The game">
        <Field
          label="Title"
          value={p.title}
          testId="pf-title"
          hint="Shown on the DS menu (line 1)"
          onCommit={(v) => edit("Change Title", (t) => (t.title = v))}
        />
        <Field
          label="Subtitle"
          value={p.subtitle}
          testId="pf-subtitle"
          hint="Line 2 of the DS menu"
          onCommit={(v) => edit("Change Subtitle", (t) => (t.subtitle = v))}
        />
        <Field
          label="Author"
          value={p.author}
          testId="pf-author"
          hint="Line 3 of the DS menu"
          onCommit={(v) => edit("Change Author", (t) => (t.author = v))}
        />
        <p className="pf-note">
          Project name: {p.name} · Icon: {p.icon} (32x32, up to 15 colours)
        </p>
      </Section>
      <Section title="Rooms">
        <Select
          label="First room"
          value={p.firstRoom}
          testId="pf-first-room"
          options={p.rooms.map((r) => [r, r])}
          onChange={(v) => edit("Change First Room", (t) => (t.firstRoom = v))}
          hint="The room the game starts in"
        />
        <p className="pf-note">Order for room_goto_next and room_goto_previous:</p>
        <ol className="pf-rooms">
          {p.rooms.map((r, i) => (
            <li key={r}>
              {r}
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r} up`}>
                {"↑"}
              </button>
              <button
                type="button"
                disabled={i === p.rooms.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${r} down`}
              >
                {"↓"}
              </button>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

function SpriteForm({ host, name, project }: { host: PanelHost; name: string; project: Project }) {
  const res: ResourceRef = { kind: "sprite", name };
  const s = project.sprites.find((x) => x.name === name);
  if (!s) return null;
  type S = (typeof project.sprites)[number];
  const edit = makeEditor<S>(
    host,
    res,
    SpriteJsonSchema,
    (d) => d.sprites.find((x) => x.name === name) as S | undefined,
    without,
  );
  return (
    <>
      <Section title="Frames">
        {numberField<S>(
          "Frames",
          s.frames,
          edit,
          (t, n) => (t.frames = n),
          "pf-frames",
          "Pictures in the strip, left to right",
        )}
        {numberField<S>("Frame width", s.frameWidth, edit, (t, n) => (t.frameWidth = n), "pf-frame-width")}
        {numberField<S>("Frame height", s.frameHeight, edit, (t, n) => (t.frameHeight = n), "pf-frame-height")}
      </Section>
      <Section title="Origin (the point x and y refer to)">
        {numberField<S>("X", s.origin.x, edit, (t, n) => (t.origin.x = n), "pf-origin-x")}
        {numberField<S>("Y", s.origin.y, edit, (t, n) => (t.origin.y = n), "pf-origin-y")}
      </Section>
      <Section title="Collision box (inside one frame)">
        {numberField<S>("Left", s.bbox.left, edit, (t, n) => (t.bbox.left = n), "pf-bbox-left")}
        {numberField<S>("Top", s.bbox.top, edit, (t, n) => (t.bbox.top = n), "pf-bbox-top")}
        {numberField<S>("Right", s.bbox.right, edit, (t, n) => (t.bbox.right = n), "pf-bbox-right")}
        {numberField<S>("Bottom", s.bbox.bottom, edit, (t, n) => (t.bbox.bottom = n), "pf-bbox-bottom")}
      </Section>
      <Section title="Colours">
        <Select
          label="Colours"
          value={s.colorMode}
          testId="pf-color-mode"
          options={[
            ["auto", "Automatic"],
            ["16", "16 colours"],
            ["256", "256 colours"],
          ]}
          onChange={(v) => edit("Change Colours", (t) => (t.colorMode = v as S["colorMode"]))}
          hint="16 colours use less memory; more than 15 colours needs 256"
        />
        <Field
          label="Transparent"
          value={s.transparent}
          testId="pf-transparent"
          hint={'"alpha" uses the PNG\'s transparency; a colour like #ff00ff makes that colour see-through'}
          onCommit={(v) => edit("Change Transparency", (t) => (t.transparent = v as S["transparent"]))}
        />
      </Section>
    </>
  );
}

function BackgroundForm({ project, name }: { project: Project; name: string }) {
  const b = project.backgrounds.find((x) => x.name === name);
  if (!b) return null;
  return (
    <Section title="Picture">
      <p className="pf-note" data-testid="pf-background-file">
        backgrounds/{name}/{b.file}: up to 512x512 pixels, drawn in 8x8 tiles.
      </p>
    </Section>
  );
}

function SoundForm({ host, project, name }: { host: PanelHost; project: Project; name: string }) {
  const s = project.sounds.find((x) => x.name === name);
  if (!s) return null;
  type S = (typeof project.sounds)[number];
  const edit = makeEditor<S>(
    host,
    { kind: "sound", name },
    SoundJsonSchema,
    (d) => d.sounds.find((x) => x.name === name) as S | undefined,
    without,
  );
  return (
    <Section title="Sound">
      <Select
        label="Kind"
        value={s.kind}
        testId="pf-sound-kind"
        options={[
          ["effect", "Sound effect"],
          ["music", "Music"],
        ]}
        onChange={(v) => edit("Change Kind", (t) => (t.kind = v as S["kind"]))}
      />
      <p className="pf-note">
        File: sounds/{name}/{s.file}
      </p>
    </Section>
  );
}

function RoomForm({ host, project, name }: { host: PanelHost; project: Project; name: string }) {
  const r = project.rooms.find((x) => x.name === name);
  if (!r) return null;
  type R = (typeof project.rooms)[number];
  const edit = makeEditor<R>(
    host,
    { kind: "room", name },
    RoomJsonSchema,
    (d) => d.rooms.find((x) => x.name === name) as R | undefined,
    without,
  );
  const bgOptions: [string, string][] = [
    ["", "(none)"],
    ...project.backgrounds.map((b): [string, string] => [b.name, b.name]),
  ];
  const screen = (which: "top" | "bottom", title: string) => (
    <Section title={title}>
      <Select
        label="Background"
        value={r.screens[which].background ?? ""}
        testId={`pf-${which}-background`}
        options={bgOptions}
        onChange={(v) => edit("Change Background", (t) => (t.screens[which].background = v || null))}
      />
      {numberField<R>(
        "View x",
        r.screens[which].viewX,
        edit,
        (t, n) => (t.screens[which].viewX = n),
        `pf-${which}-view-x`,
        "Where this screen's view starts in the room",
      )}
      {numberField<R>(
        "View y",
        r.screens[which].viewY,
        edit,
        (t, n) => (t.screens[which].viewY = n),
        `pf-${which}-view-y`,
      )}
    </Section>
  );
  return (
    <>
      <Section title="Size">
        {numberField<R>(
          "Width",
          r.width,
          edit,
          (t, n) => (t.width = n),
          "pf-room-width",
          "In pixels; one DS screen is 256 wide",
        )}
        {numberField<R>(
          "Height",
          r.height,
          edit,
          (t, n) => (t.height = n),
          "pf-room-height",
          "One DS screen is 192 high",
        )}
      </Section>
      {screen("top", "Top screen")}
      {screen("bottom", "Bottom screen (touch)")}
      <p className="pf-note">
        {r.instances.length} instance{r.instances.length === 1 ? "" : "s"} placed. The room editor places them.
      </p>
    </>
  );
}

function PropertiesView({ host, resource }: { host: PanelHost; resource: ResourceRef }) {
  const project = useProject(host);
  if (!project) return <div className="panel-empty">No project is open.</div>;
  const title = resource.kind === "settings" ? "Game Settings" : `${resource.name} (${resource.kind})`;
  return (
    <div className="properties" data-testid={`properties:${resource.kind}:${resource.name}`}>
      <h2>{title}</h2>
      {resource.kind === "settings" ? <SettingsForm host={host} project={project} /> : null}
      {resource.kind === "sprite" ? <SpriteForm host={host} project={project} name={resource.name} /> : null}
      {resource.kind === "background" ? <BackgroundForm project={project} name={resource.name} /> : null}
      {resource.kind === "sound" ? <SoundForm host={host} project={project} name={resource.name} /> : null}
      {resource.kind === "room" ? <RoomForm host={host} project={project} name={resource.name} /> : null}
    </div>
  );
}

const KINDS = new Set(["settings", "sprite", "background", "sound", "room"]);

/** The fallback property editor's C12 factory. */
export const propertiesEditorFactory: EditorPanelFactory = {
  kind: "properties",
  canOpen: (r) => KINDS.has(r.kind),
  create({ element, host }): EditorPanel {
    const root = createRoot(element);
    let id = "";
    return {
      get id() {
        return id;
      },
      kind: "properties",
      open(resource) {
        id = `${resource.kind}:${resource.name}`;
        root.render(<PropertiesView host={host} resource={resource} />);
      },
      // Everything lives in the store, which Save writes (project.save).
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
