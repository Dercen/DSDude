/**
 * The mock host (C12, `fixtures/ide/mock-host`; import it as `@dsdude/ide/mock-host`): the IDE's renderer services
 * without Electron, for headless Chromium (Vitest browser mode, `DSDUDE_SKIP_ELECTRON=1`). WS6b mounts its editors
 * with `mountEditor`, WS7 checks Learn content with `mountLearn`, and `mountShell` shows the whole IDE UI.
 *
 * Everything main would do runs in memory behind `createLocalBridge`, so requests and responses pass the same C5 zod
 * validation as in the IDE: a sample project (default samples/flappy, loaded through C1 `load`), its asset files,
 * settings, the repo's Learn documents, and a fake build + emulator that print MOCK lines.
 */
import "../styles.css";
import {
  createLocalBridge,
  type DsdudeBridge,
  type EventChannel,
  type EventPayload,
  type InvokeHandlers,
  type Settings,
  SettingsSchema,
} from "@dsdude/ipc-contract";
import type { Diagnostic, Project } from "@dsdude/project-format";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { IdeContext } from "../ide-context.tsx";
import { setBridge } from "../ipc.ts";
import { LearnPanel } from "../learn/LearnPanel.tsx";
import type { EditorPanel, EditorPanelFactory, LearnTarget, PanelHost, ResourceRef } from "../panels/api.ts";
import { createPanelHost } from "../panels/host.ts";
import { createUndoStack } from "../panels/kit.ts";
import { createIde, type Ide } from "../store/ide.ts";
import { listDocs, loadSample, readDoc, sampleFile } from "./data.ts";

export { sampleNames } from "./data.ts";

/** What the fake emulator prints on Play (C4 MOCK_EMULATOR_LINES). */
export const MOCK_EMULATOR_LINES = ["DSD|READY|0.1.0|00000000", "DSD|LOG|hello"] as const;

export interface MockHostOptions {
  /** A samples/ folder with a project.json (default "flappy"), or a Project to use as is, or null for none. */
  project?: string | Project | null;
  /** Settings that differ from the defaults. */
  settings?: Partial<Settings>;
  /** Diagnostics every build reports; an error makes Play fail. */
  buildDiagnostics?: Diagnostic[];
  /** Lines the fake emulator prints after Play (default MOCK_EMULATOR_LINES). */
  emulatorLines?: readonly string[];
  /** Extra Learn documents by path (they win over the repo's docs/). */
  docs?: Readonly<Record<string, string>>;
  /** Replace or add handlers (e.g. `assets.preview` with WS5's previewSprite). */
  handlers?: InvokeHandlers;
}

export interface MountedEditor {
  panel: EditorPanel;
  host: PanelHost;
  element: HTMLElement;
  /** The panel's last reported dirty state. */
  dirty(): boolean;
  unmount(): void;
}

export interface MountedView {
  element: HTMLElement;
  unmount(): void;
}

export interface MockHost {
  /** The project folder ("/samples/flappy"), or null. */
  readonly dir: string | null;
  readonly bridge: DsdudeBridge;
  /** Sends a C5 event as main would (validated). */
  emit<C extends EventChannel>(channel: C, payload: EventPayload<C>): void;
  /** The store and actions the mounted views share (project loaded). */
  readonly ide: Ide;
  /** Every invoke, in order. */
  readonly calls: { channel: string; request: unknown }[];
  /** What the views asked the layout to do: "document:<id>", "resource:<kind>:<name>", "learn", "focus:<panel>". */
  readonly layout: string[];
  /** Asset files written through project.writeFile (project-relative path -> bytes). */
  readonly files: Map<string, Uint8Array>;
  /** Every project.save, in order. */
  readonly saved: Project[];
  /** A PanelHost with its own undo stack, as the IDE gives each editor. */
  createHost(): PanelHost;
  mountEditor(factory: EditorPanelFactory, resource: ResourceRef, element?: HTMLElement): Promise<MountedEditor>;
  mountLearn(target?: LearnTarget | string | null, element?: HTMLElement): Promise<MountedView>;
  /** The whole IDE UI over this host. Only once per page (the shell's store is a module singleton). */
  mountShell(element?: HTMLElement): Promise<MountedView>;
  /** Unmounts everything this host mounted. */
  dispose(): void;
}

function makeElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:1024px;height:720px;overflow:hidden;background:#1e1e1e;color:#d4d4d4";
  document.body.appendChild(el);
  return el;
}

export async function createMockHost(options: MockHostOptions = {}): Promise<MockHost> {
  let dir: string | null = null;
  let project: Project | null = null;
  let sample: string | null = null;
  const choice = options.project === undefined ? "flappy" : options.project;
  if (typeof choice === "string") {
    ({ dir, project } = await loadSample(choice));
    sample = choice;
  } else if (choice) {
    project = choice;
    dir = choice.dir || "/mock-project";
  }

  let settings: Settings = SettingsSchema.parse({
    learnOpened: true,
    firstRunDone: true,
    ...options.settings,
    recentProjects: options.settings?.recentProjects ?? (dir ? [dir] : []),
  });
  const files = new Map<string, Uint8Array>();
  const saved: Project[] = [];
  const calls: { channel: string; request: unknown }[] = [];
  const layout: string[] = [];
  const cleanups: (() => void)[] = [];
  const editors = new Map<string, { panel: EditorPanel; dirty: boolean }>();
  let running = false;
  // Set once the bridge exists; the handlers call it.
  let emit: MockHost["emit"] = () => {};

  const fail = (diagnostics: Diagnostic[]) => diagnostics.some((d) => d.severity === "error");
  const base: InvokeHandlers = {
    "project.open": ({ dir: d }) => ({ project: d === dir ? project : null, diagnostics: [] }),
    "project.save": ({ project: p }) => {
      project = p;
      saved.push(p);
      return { ok: true };
    },
    "project.readFile": async ({ path }) => {
      const bytes = files.get(path) ?? (sample ? await sampleFile(sample, path) : null);
      if (!bytes) throw new Error(`ENOENT: ${path}`);
      return { bytes };
    },
    "project.writeFile": ({ path, bytes }) => {
      files.set(path, bytes);
      return { ok: true };
    },
    "settings.get": ({ key }) => ({ value: settings[key] }),
    "settings.set": ({ key, value }) => {
      settings = SettingsSchema.parse({ ...settings, [key]: value });
      return { ok: true };
    },
    "settings.getAll": () => ({ settings }),
    "dialog.open": () => ({ paths: dir ? [dir] : [] }),
    "dialog.readPicked": async ({ path }) => {
      const bytes = files.get(path) ?? (sample ? await sampleFile(sample, path) : null);
      if (!bytes) throw new Error(`ENOENT: ${path}`);
      return { bytes };
    },
    "project.templates": () => ({
      templates: [{ id: "empty", title: "Empty", description: "One room on both screens and nothing in it." }],
    }),
    "app.info": () => ({
      version: "0.1.0",
      packaged: false,
      defaultProjectsDir: "/projects",
      oneDriveDirs: [],
      supportedKeys: [
        ..."abcdefghijklmnopqrstuvwxyz0123456789",
        "Enter",
        "Shift",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ],
    }),
    "learn.list": () => {
      const docs = listDocs();
      for (const path of Object.keys(options.docs ?? {}))
        if (!docs.some((d) => d.path === path))
          docs.push({ path, title: path, section: path.split("/")[1] as "tutorial" | "manual" | "reference" });
      return { docs };
    },
    "learn.read": ({ path }) => readDoc(path, options.docs),
    "learn.openAssets": () => ({ path: "/docs/tutorial/assets" }),
    "build.play": async (req) => {
      const diagnostics = options.buildDiagnostics ?? [];
      emit("build.progress", { phase: "load", progress: 0 });
      emit("build.log", { lines: ["mock build"] });
      emit("build.diagnostics", { diagnostics });
      if (fail(diagnostics)) {
        emit("build.progress", { phase: "failed", progress: 1 });
        return { ok: false, ndsPath: null, diagnostics, timings: {}, emulator: null };
      }
      emit("build.progress", { phase: "running", progress: 1 });
      emit("build.log", { lines: [`Controls: Arrows = D-pad (mock, ${req.projectDir})`] });
      running = true;
      queueMicrotask(() => emit("emulator.log", { lines: [...(options.emulatorLines ?? MOCK_EMULATOR_LINES)] }));
      return {
        ok: true,
        ndsPath: `${req.projectDir}/build/game.nds`,
        diagnostics,
        timings: {},
        emulator: { kind: "melonds", pid: null },
      };
    },
    "build.build": () => {
      const diagnostics = options.buildDiagnostics ?? [];
      return { ok: !fail(diagnostics), ndsPath: null, diagnostics, timings: {} };
    },
    "build.compileOnly": () => {
      const diagnostics = options.buildDiagnostics ?? [];
      return { ok: !fail(diagnostics), ndsPath: null, diagnostics, timings: {} };
    },
    "build.cancel": () => ({ ok: true }),
    "build.manifest": () => ({ manifest: null }),
    "emulator.stop": () => {
      if (running) {
        running = false;
        emit("emulator.log", { lines: ["DSD|EXIT|0"] });
        emit("emulator.exit", { code: 0 });
      }
      return { ok: true };
    },
    "emulator.status": () =>
      running ? { running: true, kind: "melonds", pid: null } : { running: false, kind: null, pid: null },
    "toolchain.status": () => ({ installed: true, blocksdsVersion: "1.24.0", diagnostics: [] }),
    "doctor.run": () => ({
      checks: [{ name: "Build service", ok: true, status: "info", detail: "The mock host needs no tools." }],
    }),
    "emulator.install": ({ kind }) => ({ exe: `/emulators/${kind}.exe` }),
  };
  const handlers: InvokeHandlers = { ...base, ...options.handlers };
  // Record every call (before validation, as the renderer made it).
  const recorded: InvokeHandlers = {};
  for (const [channel, handler] of Object.entries(handlers))
    (recorded as Record<string, unknown>)[channel] = (req: unknown) => {
      calls.push({ channel, request: req });
      return (handler as (r: unknown) => unknown)(req);
    };
  const local = createLocalBridge(recorded);
  emit = local.emit;
  setBridge(local.bridge);

  const ide = createIde(
    local.bridge,
    {
      openDocument: (id) => layout.push(`document:${id}`),
      openResource: (r) => layout.push(`resource:${r.kind}:${r.name}`),
      showLearn: () => layout.push("learn"),
      focusPanel: (id) => layout.push(`focus:${id}`),
    },
    {
      savePanels: async () => {
        for (const e of editors.values()) if (e.dirty) await e.panel.save();
        return true;
      },
    },
  );
  cleanups.push(ide.actions.connect());
  if (dir) await ide.actions.openProject(dir);
  // settings.getAll without the round trip, as boot() would do
  ide.store.setState({ settings });

  const createHost = () => createPanelHost(ide, local.bridge, createUndoStack());

  const render = (node: Parameters<ReturnType<typeof createRoot>["render"]>[0], element: HTMLElement): MountedView => {
    const root = createRoot(element);
    root.render(node);
    const unmount = () => {
      root.unmount();
      element.remove();
    };
    cleanups.push(unmount);
    return { element, unmount };
  };

  return {
    dir,
    bridge: local.bridge,
    emit: local.emit,
    ide,
    calls,
    layout,
    files,
    saved,
    createHost,

    async mountEditor(factory, resource, element = makeElement()) {
      const host = createHost();
      const panel = factory.create({ element, host });
      const entry = { panel, dirty: false };
      editors.set(panel.id, entry);
      const off = panel.onDirty((d) => {
        entry.dirty = d;
      });
      await panel.open(resource);
      const unmount = () => {
        off();
        editors.delete(panel.id);
        panel.dispose();
        element.remove();
      };
      cleanups.push(unmount);
      return { panel, host, element, dirty: () => entry.dirty, unmount };
    },

    async mountLearn(target = null, element = makeElement()) {
      if (target !== null) ide.actions.openLearn(target);
      const view = render(createElement(IdeContext.Provider, { value: ide }, createElement(LearnPanel)), element);
      await new Promise((r) => setTimeout(r, 0));
      return view;
    },

    async mountShell(element = makeElement()) {
      const { App } = await import("../App.tsx");
      const view = render(createElement(App), element);
      return view;
    },

    dispose() {
      for (const c of cleanups.splice(0).reverse()) c();
      setBridge(null);
    },
  };
}
