/**
 * A document tab: Monaco over the document's model. Edits go to the store (marking the document dirty); store changes
 * (another save, a reload) flow back into the model. Problems for this file become Monaco markers, and a Problems
 * click reveals its line here.
 */
import type { Diagnostic } from "@dsdude/project-format";
import type { IDockviewPanelProps } from "dockview-react";
import { useEffect, useRef } from "react";
import { useIdeInstance } from "../ide-context.tsx";
import { modelFor } from "../monaco/models.ts";
import { monaco } from "../monaco/setup.ts";
import { getDocText, parseDocId } from "../store/documents.ts";
import { type IdeState, problemsOf } from "../store/ide.ts";

const SEVERITY = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
} as const;

function markersFor(model: ReturnType<typeof modelFor>, docId: string, problems: Diagnostic[]) {
  return problems
    .filter((d) => d.file === docId && d.line !== null)
    .map((d) => {
      const line = Math.min(d.line ?? 1, model.getLineCount());
      const col = d.col ?? 1;
      const endLine = d.endLine ?? line;
      const endCol = d.endCol ? d.endCol + 1 : d.col ? col + 1 : model.getLineMaxColumn(line);
      return {
        severity: SEVERITY[d.severity],
        message: d.hint ? `${d.message}\n${d.hint}` : d.message,
        code: d.code,
        source: "DSDude",
        startLineNumber: line,
        startColumn: col,
        endLineNumber: endLine,
        endColumn: endCol,
      };
    });
}

export function CodePanel({ params }: IDockviewPanelProps<{ docId: string }>) {
  const { docId } = params;
  const { store, actions } = useIdeInstance();
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const project = store.getState().project;
    const model = modelFor(docId, (project && getDocText(project, docId)) ?? "");
    const editor = monaco.editor.create(el.current, {
      model,
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      readOnly: parseDocId(docId)?.kind === "json",
    });
    let applying = false;
    const sub = model.onDidChangeContent(() => {
      if (!applying) actions.editDocument(docId, model.getValue());
    });
    const setMarkers = (s: IdeState) =>
      monaco.editor.setModelMarkers(model, "dsdude", markersFor(model, docId, problemsOf(s)));
    const reveal = (s: IdeState) => {
      if (s.reveal?.docId !== docId) return;
      const line = Math.min(s.reveal.line, model.getLineCount());
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: s.reveal.col });
      editor.focus();
    };
    setMarkers(store.getState());
    reveal(store.getState());
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.project !== prev.project && s.project) {
        const text = getDocText(s.project, docId);
        if (text !== null && text !== model.getValue()) {
          applying = true;
          model.setValue(text);
          applying = false;
        }
      }
      if (
        s.loadDiagnostics !== prev.loadDiagnostics ||
        s.buildDiagnostics !== prev.buildDiagnostics ||
        s.runtimeDiagnostics !== prev.runtimeDiagnostics
      )
        setMarkers(s);
      if (s.reveal !== prev.reveal) reveal(s);
    });
    return () => {
      unsubscribe();
      sub.dispose();
      editor.dispose();
    };
  }, [docId, store, actions]);

  return <div ref={el} className="monaco-host" data-testid={`code:${docId}`} />;
}
