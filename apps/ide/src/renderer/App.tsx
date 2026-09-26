/** The IDE shell: toolbar, the dockview workbench, status bar and toast. */
import "dockview/dist/styles/dockview.css";
import { DockviewReact, type DockviewReadyEvent, themeDark } from "dockview-react";
import { useEffect } from "react";
import { IdeContext, useActions, useIde } from "./ide-context.tsx";
import { ipc } from "./ipc.ts";
import { LearnPanel } from "./learn/LearnPanel.tsx";
import { disposeAllModels, installLearnLinkOpener } from "./monaco/models.ts";
import { createObjectEditorFactory } from "./object-editor/ObjectEditor.tsx";
import { CodePanel } from "./panels/CodePanel.tsx";
import { EditorHostPanel } from "./panels/EditorHostPanel.tsx";
import { OutputPanel } from "./panels/OutputPanel.tsx";
import { ProblemsPanel } from "./panels/ProblemsPanel.tsx";
import { ProjectTree } from "./panels/ProjectTree.tsx";
import { loadEditorModules, registerEditor, saveDirtyPanels } from "./panels/registry.ts";
import { WelcomePanel } from "./panels/WelcomePanel.tsx";
import { createIde } from "./store/ide.ts";
import { DockWorkbench } from "./workbench.ts";

loadEditorModules();
const workbench = new DockWorkbench();
const ide = createIde(ipc, workbench, {
  savePanels: () => saveDirtyPanels((message) => ide.actions.showToast(message, "error")),
});
installLearnLinkOpener((target) => ide.actions.openLearn(target));
registerEditor(createObjectEditorFactory(ide));
let started = false;

const components = {
  project: ProjectTree,
  welcome: WelcomePanel,
  code: CodePanel,
  editor: EditorHostPanel,
  learn: LearnPanel,
  output: OutputPanel,
  problems: ProblemsPanel,
};

const PHASE: Record<string, string> = {
  load: "Loading the project",
  assets: "Converting assets",
  compile: "Compiling",
  budgets: "Checking limits",
  runtime: "Preparing the runtime",
  pack: "Packing the ROM",
  launch: "Starting the emulator",
};

function Toolbar() {
  const actions = useActions();
  const status = useIde((s) => s.build.status);
  const hasProject = useIde((s) => s.project !== null);
  const dirty = useIde((s) => Object.keys(s.dirty).length > 0);
  return (
    <div className="toolbar">
      <button type="button" data-testid="open" onClick={() => void actions.chooseAndOpenProject()}>
        Open…
      </button>
      <button
        type="button"
        data-testid="save"
        onClick={() => void actions.save()}
        title={dirty ? "Save changes (Ctrl+S)" : "Save (Ctrl+S)"}
      >
        Save{dirty ? " \u25cf" : ""}
      </button>
      <button type="button" data-testid="learn-button" onClick={() => actions.openLearn(null)} title="Learn (F1)">
        Learn
      </button>
      <span className="toolbar-gap" />
      {status === "running" ? (
        <button type="button" className="stop" data-testid="stop" onClick={() => void actions.stop()}>
          {"■"} Stop
        </button>
      ) : (
        <button
          type="button"
          className="play"
          data-testid="play"
          disabled={!hasProject || status === "building"}
          onClick={() => void actions.play()}
        >
          {"▶"} Play
        </button>
      )}
    </div>
  );
}

function StatusBar() {
  const build = useIde((s) => s.build);
  const stats = useIde((s) => s.stats);
  const text =
    build.status === "building"
      ? `${PHASE[build.phase ?? ""] ?? "Building"}… ${Math.round(build.progress * 100)}%`
      : build.status === "running"
        ? `Game running${stats?.fps !== undefined ? ` · ${stats.fps} fps` : ""}`
        : "Ready";
  return (
    <div className="statusbar" data-testid="status">
      {text}
    </div>
  );
}

function ToastView() {
  const toast = useIde((s) => s.toast);
  const actions = useActions();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => actions.dismissToast(), 5000);
    return () => clearTimeout(t);
  }, [toast, actions]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="status" data-testid="toast">
      {toast.message}
      <button type="button" aria-label="Dismiss" onClick={() => actions.dismissToast()}>
        {"×"}
      </button>
    </div>
  );
}

function onReady(event: DockviewReadyEvent) {
  workbench.attach(event.api);
  console.info("dockview|ready");
}

export function App() {
  useEffect(() => {
    const off = ide.actions.connect();
    const unbind = workbench.bindStore(ide.store);
    const unModels = ide.store.subscribe((s, prev) => {
      if (s.projectDir !== prev.projectDir) disposeAllModels();
    });
    if (!started) {
      started = true;
      void ide.actions.boot();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void ide.actions.save();
      } else if (e.key === "F5" && e.shiftKey) {
        e.preventDefault();
        void ide.actions.stop();
      } else if (e.key === "F5") {
        e.preventDefault();
        void ide.actions.play();
      } else if (e.key === "F1" && !(e.target instanceof Element && e.target.closest(".monaco-editor"))) {
        // Monaco editors handle F1 themselves (the word under the cursor); elsewhere F1 opens Learn.
        e.preventDefault();
        ide.actions.openLearn(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      off();
      unbind();
      unModels();
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return (
    <IdeContext.Provider value={ide}>
      <div className="app">
        <Toolbar />
        <div className="workbench">
          <DockviewReact components={components} onReady={onReady} theme={themeDark} />
        </div>
        <StatusBar />
        <ToastView />
      </div>
    </IdeContext.Provider>
  );
}
