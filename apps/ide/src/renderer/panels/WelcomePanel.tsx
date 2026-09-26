/** Shown in the editor area until the first document opens. */
import { useActions, useIde } from "../ide-context.tsx";

export function WelcomePanel() {
  const project = useIde((s) => s.project);
  const actions = useActions();
  return (
    <div className="welcome">
      <h1>DSDude</h1>
      {project ? (
        <p>Pick an event in the Project tree to edit it, then press Play.</p>
      ) : (
        <>
          <p>Make Nintendo DS games. Start a new project, or open one you have.</p>
          <p className="welcome-buttons">
            <button type="button" className="primary" onClick={() => actions.showNewProject()}>
              New project…
            </button>
            <button type="button" onClick={() => void actions.chooseAndOpenProject()}>
              Open a project…
            </button>
          </p>
        </>
      )}
    </div>
  );
}
