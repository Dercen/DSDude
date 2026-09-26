/** One Monaco model per document, keyed by `dsdude:/<docId>`; all are disposed when another project opens. */
import { LEARN_URI_SCHEME, type LearnTarget, parseLearnUri } from "../panels/api.ts";
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

let learnOpener: { dispose(): void } | null = null;

/** Hover and markdown links with a `dsdude-learn:` URI (C12) open the Learn panel instead of a browser. */
export function installLearnLinkOpener(open: (target: LearnTarget) => void): void {
  learnOpener?.dispose();
  learnOpener = monaco.editor.registerLinkOpener({
    open(uri) {
      if (uri.scheme !== LEARN_URI_SCHEME) return false;
      const target = parseLearnUri(uri.toString(true));
      if (target) open(target);
      return true;
    },
  });
}
