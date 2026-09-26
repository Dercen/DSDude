/**
 * The IDE store (zustand, vanilla) over the C1 Project, plus the actions that talk to main through C5. The layout
 * is injected as a `Workbench`, so node Vitest drives the store with `createLocalBridge` and a fake workbench.
 */
import { type DsdudeBridge, type EventPayload, parseIpcError, type Settings } from "@dsdude/ipc-contract";
import type { Diagnostic, Project } from "@dsdude/project-format";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type OutputLine, parseLogLine, type Stats, type Usage } from "../log.ts";
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
}

/** What the store needs from the dockview layout. */
export interface Workbench {
  openDocument(docId: string): void;
  focusPanel(id: "problems" | "output" | "project"): void;
}

export interface IdeActions {
  boot(): Promise<void>;
  openProject(dir: string): Promise<boolean>;
  chooseAndOpenProject(): Promise<void>;
  save(): Promise<boolean>;
  play(): Promise<void>;
  stop(): Promise<void>;
  editDocument(docId: string, text: string): void;
  openDocument(docId: string): void;
  revealDiagnostic(d: Diagnostic): void;
  clearOutput(): void;
  showToast(message: string, kind?: Toast["kind"]): void;
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

export function createIde(ipc: DsdudeBridge, workbench: Workbench): Ide {
  const store = createStore<IdeState>()(initial);
  const set = store.setState;
  const get = store.getState;
  let toastSeq = 0;
  let revealSeq = 0;
  let exitSeq = 0;

  const append = (...lines: OutputLine[]) => {
    if (lines.length === 0) return;
    const output = get().output.concat(lines);
    set({ output: output.length > OUTPUT_LIMIT ? output.slice(output.length - OUTPUT_LIMIT) : output });
  };

  const actions: IdeActions = {
    async boot() {
      try {
        const { settings } = await ipc.invoke("settings.getAll", {});
        set({ settings });
        const recent = settings.recentProjects[0];
        if (recent) await actions.openProject(recent);
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
      const { projectDir, project, dirty, build } = get();
      if (!projectDir || !project) {
        actions.showToast("Open a project first.", "error");
        return;
      }
      if (build.status === "building") return;
      if (Object.keys(dirty).length > 0 && !(await actions.save())) return;
      const seq = exitSeq;
      set({ build: { status: "building", phase: "load", progress: 0 }, runtimeDiagnostics: [], stats: null });
      append({ kind: "info", text: `Play ${project.project.title}` });
      try {
        const res = await ipc.invoke("build.play", {
          projectDir,
          emulator: get().settings?.emulator,
        });
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
      } catch (err) {
        set({ build: { ...get().build, status: "idle" } });
        actions.showToast(`Play failed: ${parseIpcError(err).message}`, "error");
      }
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

    openDocument(docId) {
      workbench.openDocument(docId);
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
