/**
 * Monaco 0.57 through its 0.56+ entry points (PLAN.md 2.5). Never `@monaco-editor/react` or `monaco-editor/esm/vs`
 * paths. The editor worker is a dedicated Vite `?worker` bundle, allowed by `worker-src 'self' blob:`.
 */
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

/** Labels of the workers Monaco asked for, in order (spike 13 and the smoke test read it). */
export const createdWorkers: string[] = [];

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    createdWorkers.push(label);
    console.info(`monaco|worker|${label}`);
    return new EditorWorker();
  },
};

export { monaco };
