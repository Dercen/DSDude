/** One Monaco model per document, keyed by `dsdude:/<docId>`; all are disposed when another project opens. */
import { monaco } from "./setup.ts";

export function docUri(docId: string) {
  return monaco.Uri.from({ scheme: "dsdude", path: `/${docId}` });
}

export function docIdOf(model: { uri: { scheme: string; path: string } }): string | null {
  return model.uri.scheme === "dsdude" ? model.uri.path.slice(1) : null;
}

/** The document's model, created with `text` if needed. Plain text until WS7's packages/monaco-dss lands. */
export function modelFor(docId: string, text: string) {
  const uri = docUri(docId);
  const existing = monaco.editor.getModel(uri);
  if (existing) return existing;
  return monaco.editor.createModel(text, "plaintext", uri);
}

export function disposeAllModels(): void {
  for (const model of monaco.editor.getModels()) if (model.uri.scheme === "dsdude") model.dispose();
}
