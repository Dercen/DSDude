/** IDE shell layout: dockview-react with the editor area and the Output panel (task 3 fills in the rest). */
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps, themeDark } from "dockview-react";
import { MonacoHost } from "./monaco/MonacoHost.tsx";

const SAMPLE = `// DSDude\n// Step - runs every frame\nx += 1;\n`;

function EditorPanel(_props: IDockviewPanelProps) {
  return <MonacoHost value={SAMPLE} />;
}

function OutputPanel(_props: IDockviewPanelProps) {
  return <pre className="output" data-testid="output" />;
}

const components = { editor: EditorPanel, output: OutputPanel };

function onReady(event: DockviewReadyEvent) {
  const editor = event.api.addPanel({ id: "editor", component: "editor", title: "step.dss" });
  event.api.addPanel({
    id: "output",
    component: "output",
    title: "Output",
    position: { referencePanel: editor, direction: "below" },
  });
  console.info("dockview|ready");
}

export function App() {
  return (
    <div className="app">
      <DockviewReact components={components} onReady={onReady} theme={themeDark} />
    </div>
  );
}
