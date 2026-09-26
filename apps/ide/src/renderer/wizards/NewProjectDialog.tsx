/**
 * New Project (PLAN.md 1 step 1): a name, a folder (default %USERPROFILE%\DSDudeProjects, with a warning under
 * OneDrive) and a template (templates/index.json; Flappy Bird first when it is there, so the first Play comes fast).
 */
import { NAME } from "@dsdude/project-format";
import { useEffect, useState } from "react";
import { useActions, useIde } from "../ide-context.tsx";
import { ipc, parseIpcError } from "../ipc.ts";

interface Template {
  id: string;
  title: string;
  description: string;
}

/** Joins a folder and a name with the folder's own separator. */
export function joinPath(folder: string, name: string): string {
  const sep = folder.includes("\\") ? "\\" : "/";
  return `${folder.replace(/[\\/]+$/, "")}${sep}${name}`;
}

/** Whether `path` lies inside one of the OneDrive folders (case-insensitive, either separator). */
export function underOneDrive(path: string, oneDriveDirs: readonly string[]): boolean {
  const norm = (p: string) => `${p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()}/`;
  const p = norm(path);
  return oneDriveDirs.some((d) => d !== "" && p.startsWith(norm(d)));
}

/** The template picked first: Flappy Bird when listed, else the first. */
export function defaultTemplate(templates: readonly Template[]): string | null {
  return (templates.find((t) => /flappy/i.test(t.id) || /flappy/i.test(t.title)) ?? templates[0])?.id ?? null;
}

export function NewProjectDialog() {
  const open = useIde((s) => s.newProject);
  const actions = useActions();
  const [name, setName] = useState("my_game");
  const [folder, setFolder] = useState("");
  const [oneDrive, setOneDrive] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    ipc.invoke("app.info", {}).then(
      (info) => {
        setOneDrive(info.oneDriveDirs);
        setFolder((f) => f || info.defaultProjectsDir);
      },
      () => {},
    );
    ipc.invoke("project.templates", {}).then(
      ({ templates: list }) => {
        setTemplates(list);
        setTemplate((t) => t ?? defaultTemplate(list));
      },
      (err: unknown) => setError(`Could not list the templates: ${parseIpcError(err).message}`),
    );
  }, [open]);

  if (!open) return null;
  const nameOk = NAME.test(name);
  const warnOneDrive = folder !== "" && underOneDrive(folder, oneDrive);
  const canCreate = nameOk && folder !== "" && template !== null && !busy;

  const browse = async () => {
    const { paths } = await ipc.invoke("dialog.open", {
      kind: "directory",
      title: "Where should the project go?",
      defaultPath: folder || undefined,
    });
    if (paths[0]) setFolder(paths[0]);
  };
  const create = async () => {
    if (!canCreate || template === null) return;
    setBusy(true);
    setError(null);
    try {
      await actions.createProject({ parent: folder, name, template });
    } catch (err) {
      setError(parseIpcError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        data-testid="new-project"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") actions.hideNewProject();
        }}
      >
        <h2 id="new-project-title">New Project</h2>
        <label className="field">
          Name
          <input
            data-testid="np-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            // biome-ignore lint/a11y/noAutofocus: the dialog's first field.
            autoFocus
          />
        </label>
        {!nameOk ? <p className="field-error">Use letters, digits and _, starting with a letter or _.</p> : null}
        <label className="field">
          Folder
          <span className="field-row">
            <input data-testid="np-folder" value={folder} onChange={(e) => setFolder(e.target.value)} />
            <button type="button" onClick={() => void browse()}>
              Browse…
            </button>
          </span>
        </label>
        {warnOneDrive ? (
          <p className="field-warning" data-testid="np-onedrive">
            This folder is inside OneDrive. OneDrive can lock files while DSDude builds your game, so a folder outside
            OneDrive works better.
          </p>
        ) : null}
        {folder && nameOk ? <p className="field-hint">The project goes in {joinPath(folder, name)}</p> : null}
        <fieldset className="templates">
          <legend>Template</legend>
          {templates === null ? <p>Loading…</p> : null}
          {templates?.map((t) => (
            <label key={t.id} className={`template${t.id === template ? " selected" : ""}`}>
              <input
                type="radio"
                name="template"
                value={t.id}
                checked={t.id === template}
                onChange={() => setTemplate(t.id)}
                data-testid={`np-template:${t.id}`}
              />
              <span className="template-title">{t.title}</span>
              <span className="template-description">{t.description}</span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p className="field-error" data-testid="np-error">
            {error}
          </p>
        ) : null}
        <div className="dialog-buttons">
          <button type="button" onClick={() => actions.hideNewProject()}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!canCreate} data-testid="np-create">
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
