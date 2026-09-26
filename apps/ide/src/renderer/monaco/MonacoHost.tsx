/** Plain-text Monaco host (until WS7's packages/monaco-dss lands). One editor per mount, disposed on unmount. */
import { useEffect, useRef } from "react";
import { monaco } from "./setup.ts";

export interface MonacoHostProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
}

export function MonacoHost({ value, language = "plaintext", onChange }: MonacoHostProps) {
  const el = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is created once per mount; value seeds it.
  useEffect(() => {
    if (!el.current) return;
    const editor = monaco.editor.create(el.current, {
      value,
      language,
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
    });
    const sub = editor.onDidChangeModelContent(() => changeRef.current?.(editor.getValue()));
    console.info("monaco|mounted");
    return () => {
      sub.dispose();
      editor.getModel()?.dispose();
      editor.dispose();
    };
  }, []);

  return <div ref={el} className="monaco-host" data-testid="monaco-host" />;
}
