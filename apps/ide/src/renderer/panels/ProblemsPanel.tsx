/** Problems (C9): every load, build and runtime problem; a click opens the file at its line. */
import { useMemo } from "react";
import { useActions, useIde } from "../ide-context.tsx";
import { problemsOf } from "../store/ide.ts";

const ICON = { error: "✖", warning: "⚠", info: "ℹ" } as const;

export function ProblemsPanel() {
  const load = useIde((s) => s.loadDiagnostics);
  const build = useIde((s) => s.buildDiagnostics);
  const runtime = useIde((s) => s.runtimeDiagnostics);
  const actions = useActions();
  const problems = useMemo(
    () => problemsOf({ loadDiagnostics: load, buildDiagnostics: build, runtimeDiagnostics: runtime }),
    [load, build, runtime],
  );
  if (problems.length === 0)
    return (
      <div className="panel-empty" data-testid="problems">
        No problems.
      </div>
    );
  return (
    <div className="problems" data-testid="problems">
      {problems.map((d) => (
        <button
          type="button"
          key={JSON.stringify(d)}
          className={`problem problem-${d.severity}`}
          data-testid="problem"
          onClick={() => actions.revealDiagnostic(d)}
        >
          <span className="problem-icon">{ICON[d.severity]}</span>
          <span className="problem-text">
            {d.message}
            {d.hint ? <span className="problem-hint"> {d.hint}</span> : null}
          </span>
          {/* Task 4: the code links to the Learn panel (docs/reference/errors.md). */}
          <span className="problem-code">{d.code}</span>
          {d.file ? (
            <span className="problem-where">
              {d.file}
              {d.line ? `:${d.line}` : ""}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
