/**
 * A document tab: Monaco over the document's shared model (monaco/sync.ts keeps it in step with the store and draws
 * the Problems markers). A Problems click reveals its line here; F1 opens the reference for the word under the cursor.
 */
import type { IDockviewPanelProps } from "dockview-react";
import { useEffect, useRef } from "react";
import { useIdeInstance } from "../ide-context.tsx";
import { modelFor } from "../monaco/models.ts";
import { monaco } from "../monaco/setup.ts";
import { installDocumentSync } from "../monaco/sync.ts";
import { getDocText, parseDocId } from "../store/documents.ts";
import type { IdeState } from "../store/ide.ts";
import { learnTargetForBuiltin } from "./api.ts";

export function CodePanel({ params }: IDockviewPanelProps<{ docId: string }>) {
  const { docId } = params;
  const ide = useIdeInstance();
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const { store, actions } = ide;
    installDocumentSync(ide);
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
    // F1: the reference entry for the word under the cursor (WS7's monaco-dss may refine it), else Learn.
    editor.addCommand(monaco.KeyCode.F1, () => {
      const pos = editor.getPosition();
      const word = pos ? model.getWordAtPosition(pos)?.word : undefined;
      actions.openLearn(word ? learnTargetForBuiltin(word) : null);
    });
    const reveal = (s: IdeState) => {
      if (s.reveal?.docId !== docId) return;
      const line = Math.min(s.reveal.line, model.getLineCount());
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: s.reveal.col });
      editor.focus();
    };
    reveal(store.getState());
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.reveal !== prev.reveal) reveal(s);
    });
    return () => {
      unsubscribe();
      editor.dispose();
    };
  }, [docId, ide]);

  return <div ref={el} className="monaco-host" data-testid={`code:${docId}`} />;
}
