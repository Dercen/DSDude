/**
 * Keeps every document model (`dsdude:/<docId>`) and the store in step, whichever editors show it (a code tab, the
 * object editor's stacked events, or both): typing updates the store (marking the document dirty), store changes
 * (save, reload, another editor) update the model, and Problems become Monaco markers. Installed once per store.
 */
import type { Diagnostic } from "@dsdude/project-format";
import { getDocText, parseDocId } from "../store/documents.ts";
import { type Ide, type IdeState, problemsOf } from "../store/ide.ts";
import { docIdOf } from "./models.ts";
import { monaco } from "./setup.ts";

type Model = ReturnType<typeof monaco.editor.createModel>;

const SEVERITY = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
} as const;

export function markersFor(model: Model, docId: string, problems: readonly Diagnostic[]) {
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

const installed = new WeakSet<object>();

export function installDocumentSync(ide: Ide): () => void {
  if (installed.has(ide.store)) return () => {};
  installed.add(ide.store);
  const { store, actions } = ide;
  const applying = new WeakSet<Model>();
  const subs: { dispose(): void }[] = [];

  const setMarkers = (model: Model, s: IdeState) => {
    const docId = docIdOf(model);
    if (docId) monaco.editor.setModelMarkers(model, "dsdude", markersFor(model, docId, problemsOf(s)));
  };
  const attach = (model: Model) => {
    const docId = docIdOf(model);
    if (!docId) return;
    if (parseDocId(docId)?.kind !== "json")
      subs.push(
        model.onDidChangeContent(() => {
          if (!applying.has(model)) actions.editDocument(docId, model.getValue());
        }),
      );
    setMarkers(model, store.getState());
  };
  for (const m of monaco.editor.getModels()) attach(m);
  subs.push(monaco.editor.onDidCreateModel(attach));

  const unsubscribe = store.subscribe((s, prev) => {
    const models = monaco.editor.getModels().filter((m) => docIdOf(m));
    if (s.project !== prev.project && s.project) {
      for (const model of models) {
        const text = getDocText(s.project, docIdOf(model) ?? "");
        if (text !== null && text !== model.getValue()) {
          applying.add(model);
          try {
            model.setValue(text);
          } finally {
            applying.delete(model);
          }
        }
      }
    }
    if (
      s.loadDiagnostics !== prev.loadDiagnostics ||
      s.buildDiagnostics !== prev.buildDiagnostics ||
      s.runtimeDiagnostics !== prev.runtimeDiagnostics
    )
      for (const model of models) setMarkers(model, s);
  });

  return () => {
    unsubscribe();
    for (const s of subs) s.dispose();
    installed.delete(ide.store);
  };
}
