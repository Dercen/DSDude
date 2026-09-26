/**
 * Output: build lines and the game's C8 lines (parsed; DSD|PAD| and STAT never shown). It follows new lines only
 * while scrolled to the bottom, and never activates itself: log lines must not steal focus from the emulator.
 */
import { useLayoutEffect, useRef } from "react";
import { useActions, useIde } from "../ide-context.tsx";

export function OutputPanel() {
  const output = useIde((s) => s.output);
  const actions = useActions();
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current && output.length >= 0) el.scrollTop = el.scrollHeight;
  }, [output]);

  return (
    <div className="output-panel">
      <div className="panel-toolbar">
        <button type="button" onClick={() => actions.clearOutput()}>
          Clear
        </button>
      </div>
      <div
        ref={box}
        className="output"
        data-testid="output"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
        }}
      >
        {output.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are append-only; the index is their identity.
          <div key={i} className={`out-line out-${line.kind}`}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
