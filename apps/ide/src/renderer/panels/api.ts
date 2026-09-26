/**
 * Contract C12 (panel half) v0.1.0: the EditorPanel host API. Owner WS6; consumers WS6b (the visual editors) and
 * WS7 (Monaco glue, Learn content). Frozen at CP-A (hybrid and upgraded mode). Import it as `@dsdude/ide/panels`.
 * Spec: PLAN.md 5.2 C12 and this file; `fixtures/ide/mock-host` implements every service without Electron.
 * How to change me: T0 comments; T1 (minor bump + contracts/CHANGELOG.md) for a new optional member or helper;
 * T2 (ADR co-signed by WS6b and WS7) for anything that breaks an implementer or a caller.
 *
 * The renderer is sandboxed (no Node): editors reach files and main only through these services.
 *
 * Editor modules: `apps/ide/src/renderer/editors/<name>/index.ts(x)` default-exports an `EditorPanelFactory`. The
 * shell loads every such module and opens a resource in the first factory whose `canOpen` accepts it; resources no
 * factory accepts open as text. The mock host takes factories directly (`mountEditor`).
 */
import type { DsdudeBridge } from "@dsdude/ipc-contract";
import type { Project } from "@dsdude/project-format";
import type { Draft } from "immer";

export const PANEL_API_VERSION = "0.1.0";

// ---------------------------------------------------------------------------------------------------------
// Resources

export type ResourceKind = "sprite" | "background" | "sound" | "object" | "room" | "script" | "settings";

/** A project resource by kind and name. `settings` (project.json, "Game Settings") has the name "". */
export interface ResourceRef {
  kind: ResourceKind;
  name: string;
}

/** "sprite:spr_bird", "settings:". Also the id of the panel that edits the resource. */
export function resourceId(r: ResourceRef): string {
  return `${r.kind}:${r.name}`;
}

/** The C1 file that holds the resource's JSON (or the script's source): the document id the store marks dirty. */
export function resourceFile(r: ResourceRef): string {
  switch (r.kind) {
    case "sprite":
      return `sprites/${r.name}/sprite.json`;
    case "background":
      return `backgrounds/${r.name}/background.json`;
    case "sound":
      return `sounds/${r.name}/sound.json`;
    case "object":
      return `objects/${r.name}/object.json`;
    case "room":
      return `rooms/${r.name}/room.json`;
    case "script":
      return `scripts/${r.name}.dss`;
    case "settings":
      return "project.json";
  }
}

// ---------------------------------------------------------------------------------------------------------
// Panels

/**
 * One open editor. The host creates it through its factory, calls `open` with the resource, shows it in a tab (or a
 * mock-host element), and calls `dispose` when the tab closes. Model edits go through `host.project.update`, which
 * marks the resource's C1 file dirty; state the store cannot hold (unsaved pixels, a pending PNG) is the panel's own,
 * reported through `onDirty` and written by `save` (through `host.files` and/or `host.project.save`).
 */
export interface EditorPanel {
  /** `resourceId(resource)` of the resource it shows. */
  readonly id: string;
  /** The factory's `kind`. */
  readonly kind: string;
  /** Shows `resource`; the host calls it once after `create`, and again if the tab is reused for another resource. */
  open(resource: ResourceRef): void | Promise<void>;
  /** Writes the panel's pending changes; the host calls it on Save (Ctrl+S) and before Play when the panel is dirty. */
  save(): Promise<void>;
  /** Unmounts from `context.element` and frees canvases, WebGL contexts, timers and subscriptions. */
  dispose(): void;
  /** Reports the panel's own dirty state (true after an unsaved edit, false after `save`); returns the unsubscribe. */
  onDirty(listener: (dirty: boolean) => void): () => void;
}

export interface EditorPanelFactory {
  /** Unique editor name, e.g. "sprite", "room". */
  readonly kind: string;
  /** Whether this editor handles the resource (usually by `resource.kind`). */
  canOpen(resource: ResourceRef): boolean;
  create(context: PanelContext): EditorPanel;
}

export interface PanelContext {
  /** The element to render into (a React root, a canvas...). The host sizes it; observe it for resizes. */
  readonly element: HTMLElement;
  readonly host: PanelHost;
}

// ---------------------------------------------------------------------------------------------------------
// Host services

export interface PanelHost {
  readonly project: ProjectStore;
  readonly files: ProjectFiles;
  /** The typed C5 bridge (e.g. `assets.preview`, `assets.import`). Main validates every call. */
  readonly ipc: DsdudeBridge;
  /** This panel's own undo stack. The host routes Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z to it while the panel has focus. */
  readonly undo: UndoStack;
  /** A short message at the bottom right; "error" for problems the user must act on. */
  toast(message: string, kind?: "info" | "error"): void;
  /** Opens the Learn panel at a document (and anchor). Also accepts a `dsdude-learn:` URI. */
  openLearn(target: LearnTarget | string): void;
  /** Opens another resource in its editor (e.g. the room editor opening an object). */
  openResource(resource: ResourceRef): void;
}

/** The IDE's project, one immutable C1 `Project` snapshot at a time. */
export interface ProjectStore {
  /** The current snapshot; null when no project is open. Never mutate it: use `update`. */
  get(): Project | null;
  /** The project folder, or null. */
  dir(): string | null;
  /** Called after every change of the snapshot (edits, save, reload); returns the unsubscribe. */
  subscribe(listener: (project: Project | null, previous: Project | null) => void): () => void;
  /**
   * Applies an immer recipe, publishes the new snapshot and marks `resourceFile(resource)` dirty. Returns the new
   * snapshot. Throws when no project is open. Record undo yourself (see `UndoStack`), e.g. with immer patches.
   */
  update(resource: ResourceRef, recipe: (draft: Draft<Project>) => void): Project;
  /** Whether the resource's C1 file has unsaved store edits. */
  isDirty(resource: ResourceRef): boolean;
  /** Saves every JSON and DSS file through C1 `save` (project.save); false when it failed (the host shows why). */
  save(): Promise<boolean>;
}

/** Asset files of the open project (C5 project.readFile / project.writeFile): png, wav, mp3, xm, mod, it, s3m. */
export interface ProjectFiles {
  /** `path` is project-relative with "/" separators, e.g. "sprites/spr_bird/sheet.png". */
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array): Promise<void>;
}

export interface UndoEntry {
  /** Shown in the Edit menu: "Undo Paint". */
  label: string;
  undo(): void;
  redo(): void;
}

/** A per-panel linear history; pushing after an undo drops the redo branch. The host caps it at 200 entries. */
export interface UndoStack {
  push(entry: UndoEntry): void;
  /** Undoes the last entry; false when there is none. */
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** The labels of the entries `undo` and `redo` would apply next (null when none). */
  peek(): { undo: string | null; redo: string | null };
  clear(): void;
  onChange(listener: () => void): () => void;
}

// ---------------------------------------------------------------------------------------------------------
// Learn links

/**
 * A place in the Learn documents: a repo-relative markdown path (C5 LearnPathSchema) and an optional heading anchor.
 * Anchors are heading slugs (`headingSlug`) or explicit `<a id="...">` elements.
 */
export interface LearnTarget {
  path: string;
  anchor?: string;
}

/** The URI scheme Learn links use in markdown and Monaco hovers: `dsdude-learn:/docs/reference/errors.md#e101`. */
export const LEARN_URI_SCHEME = "dsdude-learn";

export function learnUri(t: LearnTarget): string {
  return `${LEARN_URI_SCHEME}:/${t.path}${t.anchor ? `#${t.anchor}` : ""}`;
}

export function parseLearnUri(uri: string): LearnTarget | null {
  const m = /^dsdude-learn:\/*([^#?]+\.md)(?:#(.*))?$/.exec(uri.trim());
  if (!m?.[1]) return null;
  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return m[2] ? { path, anchor: decodeURIComponent(m[2]) } : { path };
}

/**
 * GitHub-style heading slug, the anchor rule for every Learn page: lower case, spaces to "-", every character other
 * than a-z, 0-9, "_" and "-" dropped. "## E101" -> "e101"; "## draw_sprite(sprite, x, y)" -> "draw_spritesprite-x-y",
 * so reference entries put the bare name in the heading ("## draw_sprite") or add `<a id="draw_sprite"></a>`.
 */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

/** Where a C9 code is explained: docs/reference/errors.md, anchor = the code in lower case. Problems links use it. */
export function learnTargetForCode(code: string): LearnTarget {
  return { path: "docs/reference/errors.md", anchor: headingSlug(code) };
}

/** Where a builtin is explained (C2 kind): docs/reference/functions.md or variables.md, anchor = the name. F1 uses it. */
export function learnTargetForBuiltin(
  name: string,
  kind: "function" | "variable" | "constant" = "function",
): LearnTarget {
  return { path: `docs/reference/${kind === "function" ? "functions" : "variables"}.md`, anchor: headingSlug(name) };
}
