/** Problems (C9): every load, build and runtime problem; a click opens the file at its line. */
import { useMemo } from "react";
import { useActions, useIde } from "../ide-context.tsx";
import { problemsOf } from "../store/ide.ts";
import { learnTargetForCode } from "./api.ts";

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
        // biome-ignore lint/a11y/useSemanticElements: a row holding a nested code link cannot be a <button>.
        <div
          role="button"
          tabIndex={0}
          key={JSON.stringify(d)}
          className={`problem problem-${d.severity}`}
          data-testid="problem"
          onClick={() => actions.revealDiagnostic(d)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") actions.revealDiagnostic(d);
          }}
        >
          <span className="problem-icon">{ICON[d.severity]}</span>
          <span className="problem-text">
            {d.message}
            {d.hint ? <span className="problem-hint"> {d.hint}</span> : null}
          </span>
          <a
            href={`#${d.code}`}
            className="problem-code"
            title="What this means (Learn)"
            data-testid="problem-code"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              actions.openLearn(learnTargetForCode(d.code));
            }}
          >
            {d.code}
          </a>
          {d.file ? (
            <span className="problem-where">
              {d.file}
              {d.line ? `:${d.line}` : ""}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
