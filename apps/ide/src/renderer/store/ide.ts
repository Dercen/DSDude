/**
 * The IDE store (zustand, vanilla) over the C1 Project, plus the actions that talk to main through C5. The layout
 * is injected as a `Workbench`, so node Vitest drives the store with `createLocalBridge` and a fake workbench.
 */
import {
  type DsdudeBridge,
  type EventPayload,
  type InvokeRequest,
  type InvokeResponse,
  type ManifestSummary,
  parseIpcError,
  type Settings,
} from "@dsdude/ipc-contract";
import type { Diagnostic, Project } from "@dsdude/project-format";
import { type Draft, produce } from "immer";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type OutputLine, parseLogLine, type Stats, type Usage } from "../log.ts";
import { type LearnTarget, parseLearnUri, type ResourceRef, resourceFile } from "../panels/api.ts";
import { getDocText, setDocText } from "./documents.ts";

export type BuildStatus = "idle" | "building" | "running";
export type BuildPhase = EventPayload<"build.progress">["phase"];

/** Output keeps the most recent lines only. */
export const OUTPUT_LIMIT = 5000;

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
}

export interface IdeState {
  projectDir: string | null;
  project: Project | null;
  /** project-format load problems (C9 E29x). */
  loadDiagnostics: Diagnostic[];
  /** The last build's diagnostics (cumulative, replaced by each build.diagnostics event). */
  buildDiagnostics: Diagnostic[];
  /** DSD|ERR lines of the running game (R5xx). */
  runtimeDiagnostics: Diagnostic[];
  /** Documents edited since the last save. */
  dirty: Record<string, true>;
  output: OutputLine[];
  build: { status: BuildStatus; phase: BuildPhase | null; progress: number };
  /** Last DSD|STAT and DSD|MEM figures (meters). */
  stats: Stats | null;
  usage: Usage | null;
  settings: Settings | null;
  toast: Toast | null;
  /** A request for the editor showing `docId` to reveal a position (Problems click-to-line). */
  reveal: { docId: string; line: number; col: number; seq: number } | null;
  /** What the Learn panel shows: a document (and anchor), or the contents when `target` is null. */
  learn: { target: LearnTarget | null; seq: number };
  /** The Controls card overlay is showing (first Play of the session, or Help > Controls). */
  controlsCard: boolean;
  /** The project's last C3 assets.manifest.json (meters), null before the first build. */
  manifest: ManifestSummary | null;
  /** The New Project dialog is open. */
  newProject: boolean;
  /** The first-run wizard is open (settings.firstRunDone is false). */
  firstRun: boolean;
  /** The import dialog, for a file the user picked. */
  importing: { kind: ImportKind; sourcePath: string } | null;
  /** app.info from main (default folders, supported keys); null until boot has it. */
  appInfo: InvokeResponse<"app.info"> | null;
  /** The Settings dialog is open. */
  settingsDialog: boolean;
}

export type ImportKind = "sprite" | "background" | "sound";
export type ImportRequest = Omit<InvokeRequest<"assets.import">, "projectDir">;

/** What the store needs from the dockview layout. */
export interface Workbench {
  openDocument(docId: string): void;
  /** Opens the resource in its C12 editor, or its file as text when no editor handles it. */
  openResource(resource: ResourceRef): void;
  /** Shows (and activates) the Learn panel; it reads `learn` from the store. */
  showLearn(): void;
  focusPanel(id: "problems" | "output" | "project"): void;
}

export interface IdeOptions {
  /** Saves the dirty C12 editor panels; Save and Play call it before project.save. False stops the save. */
  savePanels?: () => Promise<boolean>;
}

export interface IdeActions {
  boot(): Promise<void>;
  openProject(dir: string): Promise<boolean>;
  chooseAndOpenProject(): Promise<void>;
  save(): Promise<boolean>;
  play(): Promise<void>;
  /** Play with melonDS's GDB stub (C4 debug); Output shows the attach command. */
  debug(): Promise<void>;
  stop(): Promise<void>;
  editDocument(docId: string, text: string): void;
  /** C12 ProjectStore.update: applies an immer recipe and marks the resource's file dirty. */
  updateResource(resource: ResourceRef, recipe: (draft: Draft<Project>) => void): Project;
  openDocument(docId: string): void;
  openResource(resource: ResourceRef): void;
  /** Opens Learn at a target or `dsdude-learn:` URI; null or no argument shows the contents. */
  openLearn(target?: LearnTarget | string | null): void;
  revealDiagnostic(d: Diagnostic): void;
  clearOutput(): void;
  showToast(message: string, kind?: Toast["kind"]): void;
  /** Re-reads the build folder's manifest (after open and after every build). */
  refreshManifest(): Promise<void>;
  /** Closes the first-run wizard and remembers it (settings.firstRunDone). */
  finishFirstRun(): Promise<void>;
  /** Picks a file for a new sprite, background or sound, then opens the import dialog. */
  startImport(kind: ImportKind): Promise<void>;
  cancelImport(): void;
  /** Imports the picked file as a new resource and adds it to the open project (unsaved edits stay). */
  importAsset(req: ImportRequest): Promise<void>;
  showSettings(): void;
  hideSettings(): void;
  /** Saves the key mapping (settings.controls); the next Play passes it to the emulator. */
  setControls(controls: Settings["controls"]): Promise<void>;
  setEmulator(kind: Settings["emulator"]): Promise<void>;
  showNewProject(): void;
  hideNewProject(): void;
  /** Creates <parent>/<name> from a template and opens it; throws (for the dialog) when main refuses. */
  createProject(opts: { parent: string; name: string; template: string }): Promise<void>;
  showControls(): void;
  hideControls(): void;
  /** Help > Tutorial assets: opens docs/tutorial/assets/ in the file manager. */
  openTutorialAssets(): Promise<void>;
  dismissToast(): void;
  /** Subscribes to the C5 events; returns the unsubscribe. */
  connect(): () => void;
}

export interface Ide {
  store: StoreApi<IdeState>;
  actions: IdeActions;
}

const initial = (): IdeState => ({
  projectDir: null,
  project: null,
  loadDiagnostics: [],
  buildDiagnostics: [],
  runtimeDiagnostics: [],
  dirty: {},
  output: [],
  build: { status: "idle", phase: null, progress: 0 },
  stats: null,
  usage: null,
  settings: null,
  toast: null,
  reveal: null,
  learn: { target: null, seq: 0 },
  controlsCard: false,
  manifest: null,
  newProject: false,
  firstRun: false,
  importing: null,
  appInfo: null,
  settingsDialog: false,
});

const errorsIn = (ds: Diagnostic[]) => ds.filter((d) => d.severity === "error");

/** Every problem once: load, build and runtime lists overlap (the build reloads the project). */
export function problemsOf(s: Pick<IdeState, "loadDiagnostics" | "buildDiagnostics" | "runtimeDiagnostics">) {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of [...s.loadDiagnostics, ...s.buildDiagnostics, ...s.runtimeDiagnostics]) {
    const key = JSON.stringify(d);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

export function createIde(ipc: DsdudeBridge, workbench: Workbench, options: IdeOptions = {}): Ide {
  const store = createStore<IdeState>()(initial);
  const set = store.setState;
  const get = store.getState;
  let toastSeq = 0;
  let revealSeq = 0;
  let exitSeq = 0;
  let controlsShown = false;

  const append = (...lines: OutputLine[]) => {
    if (lines.length === 0) return;
    const output = get().output.concat(lines);
    set({ output: output.length > OUTPUT_LIMIT ? output.slice(output.length - OUTPUT_LIMIT) : output });
  };

  /** Play, or Debug with melonDS's GDB stub. */
  async function runGame(debug: boolean): Promise<void> {
    const { projectDir, project, dirty, build } = get();
    if (!projectDir || !project) {
      actions.showToast("Open a project first.", "error");
      return;
    }
    if (build.status === "building") return;
    if ((Object.keys(dirty).length > 0 || options.savePanels) && !(await actions.save())) return;
    const seq = exitSeq;
    set({ build: { status: "building", phase: "load", progress: 0 }, runtimeDiagnostics: [], stats: null });
    append({ kind: "info", text: `${debug ? "Debug" : "Play"} ${project.project.title}` });
    try {
      const res = await ipc.invoke("build.play", {
        projectDir,
        // Only melonDS has a GDB stub (C4 E623 for DeSmuME).
        emulator: debug ? "melonds" : get().settings?.emulator,
        ...(debug ? { debug: true } : {}),
      });
      void actions.refreshManifest();
      if (!res.ok) {
        set({ build: { ...get().build, status: "idle" }, buildDiagnostics: res.diagnostics });
        const n = errorsIn(problemsOf(get())).length;
        actions.showToast(
          n > 0 ? `Fix ${n} problem${n === 1 ? "" : "s"} to play` : "The game did not start: see Output.",
          "error",
        );
        workbench.focusPanel(n > 0 ? "problems" : "output");
        return;
      }
      // The game may already have ended (emulator.exit arrived while build.play was answering).
      set({ build: { ...get().build, status: exitSeq === seq ? "running" : "idle" } });
      // The Controls card appears on the first Play of each session (PLAN.md 6 WS6).
      if (!controlsShown) actions.showControls();
    } catch (err) {
      set({ build: { ...get().build, status: "idle" } });
      actions.showToast(`Play failed: ${parseIpcError(err).message}`, "error");
    }
  }

  const actions: IdeActions = {
    async boot() {
      try {
        const { settings } = await ipc.invoke("settings.getAll", {});
        set({ settings, firstRun: !settings.firstRunDone });
        ipc.invoke("app.info", {}).then(
          (appInfo) => set({ appInfo }),
          () => {},
        );
        const recent = settings.recentProjects[0];
        if (recent) await actions.openProject(recent);
        // The Learn panel opens on first launch (PLAN.md 6 WS6).
        if (!settings.learnOpened) {
          actions.openLearn(null);
          set({ settings: { ...settings, learnOpened: true } });
          await ipc.invoke("settings.set", { key: "learnOpened", value: true });
        }
      } catch (err) {
        actions.showToast(`Could not read the settings: ${parseIpcError(err).message}`, "error");
      }
    },

    async openProject(dir) {
      try {
        const { project, diagnostics } = await ipc.invoke("project.open", { dir });
        if (!project) {
          set({ loadDiagnostics: diagnostics });
          actions.showToast("This folder is not a DSDude project.", "error");
          workbench.focusPanel("problems");
          return false;
        }
        set({
          projectDir: dir,
          project,
          loadDiagnostics: diagnostics,
          buildDiagnostics: [],
          runtimeDiagnostics: [],
          dirty: {},
          reveal: null,
        });
        const recent = [dir, ...(get().settings?.recentProjects ?? []).filter((d) => d !== dir)].slice(0, 10);
        const settings = get().settings;
        if (settings) set({ settings: { ...settings, recentProjects: recent } });
        await ipc.invoke("settings.set", { key: "recentProjects", value: recent });
        set({ manifest: null });
        void actions.refreshManifest();
        return true;
      } catch (err) {
        actions.showToast(`Could not open ${dir}: ${parseIpcError(err).message}`, "error");
        return false;
      }
    },

    async chooseAndOpenProject() {
      const { paths } = await ipc.invoke("dialog.open", { kind: "directory", title: "Open a DSDude project" });
      if (paths[0]) await actions.openProject(paths[0]);
    },

    async save() {
      if (!get().projectDir || !get().project) return false;
      if (options.savePanels && !(await options.savePanels())) return false;
      const { projectDir, project } = get();
      if (!projectDir || !project) return false;
      try {
        await ipc.invoke("project.save", { dir: projectDir, project });
        set({ dirty: {} });
        return true;
      } catch (err) {
        actions.showToast(`Could not save: ${parseIpcError(err).message}`, "error");
        return false;
      }
    },

    async play() {
      await runGame(false);
    },

    async debug() {
      await runGame(true);
    },

    async stop() {
      try {
        await ipc.invoke("emulator.stop", {});
      } finally {
        set({ build: { ...get().build, status: "idle" } });
      }
    },

    editDocument(docId, text) {
      const { project } = get();
      if (!project || getDocText(project, docId) === text) return;
      set({ project: setDocText(project, docId, text), dirty: { ...get().dirty, [docId]: true } });
    },

    updateResource(resource, recipe) {
      const { project } = get();
      if (!project) throw new Error("no project is open");
      const next = produce(project, recipe);
      if (next !== project) set({ project: next, dirty: { ...get().dirty, [resourceFile(resource)]: true } });
      return next;
    },

    openDocument(docId) {
      workbench.openDocument(docId);
    },

    openResource(resource) {
      workbench.openResource(resource);
    },

    openLearn(target = null) {
      const t = typeof target === "string" ? parseLearnUri(target) : target;
      set({ learn: { target: t, seq: get().learn.seq + 1 } });
      workbench.showLearn();
    },

    revealDiagnostic(d) {
      if (!d.file) return;
      const { project } = get();
      if (!project || getDocText(project, d.file) === null) return;
      workbench.openDocument(d.file);
      set({ reveal: { docId: d.file, line: d.line ?? 1, col: d.col ?? 1, seq: ++revealSeq } });
    },

    clearOutput() {
      set({ output: [] });
    },

    showToast(message, kind = "info") {
      set({ toast: { id: ++toastSeq, message, kind } });
    },

    dismissToast() {
      set({ toast: null });
    },

    async refreshManifest() {
      const dir = get().projectDir;
      if (!dir) return;
      try {
        const { manifest } = await ipc.invoke("build.manifest", { projectDir: dir });
        if (get().projectDir === dir) set({ manifest });
      } catch {
        // meters keep what they had
      }
    },

    async finishFirstRun() {
      set({ firstRun: false });
      const settings = get().settings;
      if (settings) set({ settings: { ...settings, firstRunDone: true } });
      try {
        await ipc.invoke("settings.set", { key: "firstRunDone", value: true });
      } catch (err) {
        actions.showToast(`Could not save the settings: ${parseIpcError(err).message}`, "error");
      }
    },

    async startImport(kind) {
      const filters = {
        sprite: [{ name: "PNG pictures", extensions: ["png"] }],
        background: [{ name: "PNG pictures", extensions: ["png"] }],
        sound: [{ name: "Sounds and music", extensions: ["wav", "mp3", "xm", "mod", "it", "s3m"] }],
      }[kind];
      const { paths } = await ipc.invoke("dialog.open", { kind: "file", title: `Import a ${kind}`, filters });
      if (paths[0]) set({ importing: { kind, sourcePath: paths[0] } });
    },

    cancelImport() {
      set({ importing: null });
    },

    async importAsset(req) {
      const dir = get().projectDir;
      if (!dir) throw new Error("no project is open");
      await ipc.invoke("assets.import", { projectDir: dir, ...req });
      // Take only the new resource from disk, so unsaved edits elsewhere stay.
      const { project: fresh } = await ipc.invoke("project.open", { dir });
      const current = get().project;
      const list = `${req.kind}s` as "sprites" | "backgrounds" | "sounds";
      const added = fresh?.[list].find((r) => r.name === req.name);
      if (current && added)
        set({
          project: produce(current, (d) => {
            const items = d[list] as { name: string }[];
            items.push(added as never);
            items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
          }),
        });
      set({ importing: null });
      actions.showToast(`Imported ${req.name}.`);
      void actions.refreshManifest();
    },

    showSettings() {
      set({ settingsDialog: true });
    },

    hideSettings() {
      set({ settingsDialog: false });
    },

    async setControls(controls) {
      const settings = get().settings;
      if (settings) set({ settings: { ...settings, controls } });
      try {
        await ipc.invoke("settings.set", { key: "controls", value: controls });
      } catch (err) {
        actions.showToast(`Could not save the keys: ${parseIpcError(err).message}`, "error");
      }
    },

    async setEmulator(kind) {
      const settings = get().settings;
      if (settings) set({ settings: { ...settings, emulator: kind } });
      try {
        await ipc.invoke("settings.set", { key: "emulator", value: kind });
      } catch (err) {
        actions.showToast(`Could not save the emulator: ${parseIpcError(err).message}`, "error");
      }
    },

    showNewProject() {
      set({ newProject: true });
    },

    hideNewProject() {
      set({ newProject: false });
    },

    async createProject({ parent, name, template }) {
      const { dir } = await ipc.invoke("project.create", { dir: parent, name, template });
      if (await actions.openProject(dir)) set({ newProject: false });
    },

    showControls() {
      controlsShown = true;
      set({ controlsCard: true });
    },

    hideControls() {
      set({ controlsCard: false });
    },

    async openTutorialAssets() {
      try {
        await ipc.invoke("learn.openAssets", {});
      } catch (err) {
        actions.showToast(`Could not open the tutorial assets: ${parseIpcError(err).message}`, "error");
      }
    },

    connect() {
      const offs = [
        ipc.on("build.log", ({ lines }) => append(...lines.map((text) => ({ kind: "build" as const, text })))),
        ipc.on("build.progress", ({ phase, progress }) => set({ build: { ...get().build, phase, progress } })),
        ipc.on("build.diagnostics", ({ diagnostics }) => set({ buildDiagnostics: diagnostics })),
        ipc.on("emulator.log", ({ lines }) => {
          const out: OutputLine[] = [];
          const runtime: Diagnostic[] = [];
          for (const raw of lines) {
            const p = parseLogLine(raw);
            if (p.type === "output") out.push(p.line);
            else if (p.type === "error") {
              out.push(p.line);
              if (p.diagnostic) runtime.push(p.diagnostic);
            } else if (p.type === "stat") set({ stats: p.stats });
            else if (p.type === "mem") {
              out.push(p.line);
              set({ usage: p.usage });
            }
          }
          append(...out);
          if (runtime.length > 0) set({ runtimeDiagnostics: [...get().runtimeDiagnostics, ...runtime] });
        }),
        ipc.on("emulator.exit", () => {
          exitSeq++;
          set({ build: { ...get().build, status: "idle" } });
        }),
      ];
      return () => {
        for (const off of offs) off();
      };
    },
  };

  return { store, actions };
}
