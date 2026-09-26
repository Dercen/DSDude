/**
 * The object editor (PLAN.md 6 WS6), a C12 EditorPanel for `object` resources:
 * - a properties bar (sprite, parent, screen, depth, visible), undoable through the panel's undo stack;
 * - every event file stacked in one scrollable panel, one Monaco model each (shared with code tabs), under collapsible
 *   "Step - runs every frame" headers;
 * - the event list as a jump bar, "+ Add Event" (creates the file with a one-line comment) and the fixed "Functions"
 *   pseudo-event at the bottom, which creates functions.dss on first click.
 */
import type { Project } from "@dsdude/project-format";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { modelFor } from "../monaco/models.ts";
import { monaco } from "../monaco/setup.ts";
import { installDocumentSync } from "../monaco/sync.ts";
import type { EditorPanel, EditorPanelFactory, PanelHost, ResourceRef } from "../panels/api.ts";
import { learnTargetForBuiltin } from "../panels/api.ts";
import { updateWithUndo } from "../panels/kit.ts";
import { eventDocId, eventLabel, functionsDocId, getDocText } from "../store/documents.ts";
import type { Ide, IdeActions } from "../store/ide.ts";
import { addableEvents, eventHeading, newEventSource, orderedEvents } from "./events.ts";

type ObjectResource = Project["objects"][number];

const FUNCTIONS = "functions";

function useProject(host: PanelHost): Project | null {
  return useSyncExternalStore((cb) => host.project.subscribe(() => cb()), host.project.get);
}

/** Objects that have `name` somewhere up their parent chain (they cannot become its parent). */
function descendantsOf(project: Project, name: string): Set<string> {
  const parentOf = new Map(project.objects.map((o) => [o.name, o.parent]));
  const out = new Set<string>();
  for (const o of project.objects) {
    let p = o.parent;
    const seen = new Set<string>();
    while (p && !seen.has(p)) {
      if (p === name) {
        out.add(o.name);
        break;
      }
      seen.add(p);
      p = parentOf.get(p) ?? null;
    }
  }
  return out;
}

function Properties({ host, obj, project }: { host: PanelHost; obj: ObjectResource; project: Project }) {
  const res: ResourceRef = { kind: "object", name: obj.name };
  const set = (label: string, change: (o: ObjectResource) => void) =>
    updateWithUndo(host, res, label, (d) => {
      const o = d.objects.find((x) => x.name === obj.name);
      if (o) change(o as ObjectResource);
    });
  const blocked = descendantsOf(project, obj.name);
  const [depth, setDepth] = useState(String(obj.depth));
  useEffect(() => setDepth(String(obj.depth)), [obj.depth]);
  const commitDepth = () => {
    const n = Number.parseInt(depth, 10);
    if (Number.isInteger(n) && n !== obj.depth) set("Change Depth", (o) => (o.depth = n));
    else setDepth(String(obj.depth));
  };
  return (
    <div className="oe-props" data-testid="object-properties">
      <label title="The picture its instances show">
        Sprite
        <select
          data-testid="prop-sprite"
          value={obj.sprite ?? ""}
          onChange={(e) => set("Change Sprite", (o) => (o.sprite = e.target.value || null))}
        >
          <option value="">(none)</option>
          {project.sprites.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </select>
      </label>
      <label title="It does everything its parent does, unless it has its own event">
        Parent
        <select
          data-testid="prop-parent"
          value={obj.parent ?? ""}
          onChange={(e) => set("Change Parent", (o) => (o.parent = e.target.value || null))}
        >
          <option value="">(none)</option>
          {project.objects
            .filter((o) => o.name !== obj.name && !blocked.has(o.name))
            .map((o) => (
              <option key={o.name}>{o.name}</option>
            ))}
        </select>
      </label>
      <label title="Which DS screen its instances appear on">
        Screen
        <select
          data-testid="prop-screen"
          value={obj.screen}
          onChange={(e) => set("Change Screen", (o) => (o.screen = e.target.value as "top" | "bottom"))}
        >
          <option value="top">Top screen</option>
          <option value="bottom">Bottom screen (touch)</option>
        </select>
      </label>
      <label title="Lower numbers are drawn in front">
        Depth
        <input
          data-testid="prop-depth"
          type="number"
          step={1}
          value={depth}
          onChange={(e) => setDepth(e.target.value)}
          onBlur={commitDepth}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDepth();
          }}
        />
      </label>
      <label title="Whether its instances are drawn">
        <input
          data-testid="prop-visible"
          type="checkbox"
          checked={obj.visible}
          onChange={(e) => set(e.target.checked ? "Show" : "Hide", (o) => (o.visible = e.target.checked))}
        />
        Visible
      </label>
    </div>
  );
}

function EventSection({
  docId,
  stem,
  host,
  actions,
  collapsed,
  onToggle,
  register,
}: {
  docId: string;
  stem: string;
  host: PanelHost;
  actions: IdeActions;
  collapsed: boolean;
  onToggle: () => void;
  register: (stem: string, entry: { el: HTMLElement; focus: () => void } | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !section.current) return;
    const project = host.project.get();
    const model = modelFor(docId, (project && getDocText(project, docId)) ?? "");
    const editor = monaco.editor.create(el, {
      model,
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      scrollBeyondLastLine: false,
      scrollbar: { alwaysConsumeMouseWheel: false, vertical: "hidden" },
      overviewRulerLanes: 0,
    });
    editor.addCommand(monaco.KeyCode.F1, () => {
      const pos = editor.getPosition();
      const word = pos ? model.getWordAtPosition(pos)?.word : undefined;
      actions.openLearn(word ? learnTargetForBuiltin(word) : null);
    });
    const fit = () => {
      el.style.height = `${Math.max(60, editor.getContentHeight())}px`;
      editor.layout();
    };
    const sub = editor.onDidContentSizeChange(fit);
    fit();
    register(stem, { el: section.current, focus: () => editor.focus() });
    return () => {
      register(stem, null);
      sub.dispose();
      editor.dispose();
    };
  }, [docId, stem, host, actions, register]);

  return (
    <section ref={section} className="oe-section" data-testid={`event:${stem}`}>
      <button type="button" className="oe-heading" onClick={onToggle} aria-expanded={!collapsed}>
        {collapsed ? "▸" : "▾"} {eventHeading(stem)}
      </button>
      <div ref={box} className="oe-code" style={collapsed ? { display: "none" } : undefined} />
    </section>
  );
}

function ObjectEditorView({ host, actions, name }: { host: PanelHost; actions: IdeActions; name: string }) {
  const project = useProject(host);
  const obj = project?.objects.find((o) => o.name === name) ?? null;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const sections = useRef(new Map<string, { el: HTMLElement; focus: () => void }>());
  const register = useRef((stem: string, entry: { el: HTMLElement; focus: () => void } | null) => {
    if (entry) sections.current.set(stem, entry);
    else sections.current.delete(stem);
  }).current;

  const jump = (stem: string) => {
    setCollapsed((c) => {
      const n = new Set(c);
      n.delete(stem);
      return n;
    });
    setPending(stem);
  };
  useLayoutEffect(() => {
    if (!pending) return;
    const s = sections.current.get(pending);
    if (!s) return;
    s.el.scrollIntoView({ block: "start" });
    s.focus();
    setPending(null);
  });

  if (!project || !obj) return <div className="panel-empty">{name} is not in this project.</div>;
  const stems = orderedEvents(obj.events);
  const add = (stem: string) => {
    if (!stem) return;
    actions.editDocument(eventDocId(name, stem), newEventSource(stem));
    jump(stem);
  };
  const openFunctions = () => {
    if (obj.functions === null) actions.editDocument(functionsDocId(name), newEventSource(FUNCTIONS));
    jump(FUNCTIONS);
  };
  const toggle = (stem: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(stem)) n.delete(stem);
      else n.add(stem);
      return n;
    });
  const groups = addableEvents(
    stems,
    project.objects.map((o) => o.name),
  );

  return (
    <div className="object-editor" data-testid={`object-editor:${name}`}>
      <Properties host={host} obj={obj} project={project} />
      <div className="oe-body">
        <nav className="oe-events" aria-label="Events">
          {stems.map((s) => (
            <button type="button" key={s} className="oe-jump" data-testid={`jump:${s}`} onClick={() => jump(s)}>
              {eventLabel(s)}
            </button>
          ))}
          <select
            className="oe-add"
            data-testid="add-event"
            value=""
            onChange={(e) => add(e.target.value)}
            aria-label="Add an event"
          >
            <option value="">+ Add Event…</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.stems.map((s) => (
                  <option key={s} value={s}>
                    {eventLabel(s)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" className="oe-jump oe-functions" data-testid="jump:functions" onClick={openFunctions}>
            Functions
          </button>
        </nav>
        <div className="oe-stack">
          {stems.length === 0 && obj.functions === null ? (
            <p className="oe-empty">This object has no events yet. Use + Add Event to give it some code.</p>
          ) : null}
          {stems.map((s) => (
            <EventSection
              key={s}
              docId={eventDocId(name, s)}
              stem={s}
              host={host}
              actions={actions}
              collapsed={collapsed.has(s)}
              onToggle={() => toggle(s)}
              register={register}
            />
          ))}
          {obj.functions !== null ? (
            <EventSection
              key={FUNCTIONS}
              docId={functionsDocId(name)}
              stem={FUNCTIONS}
              host={host}
              actions={actions}
              collapsed={collapsed.has(FUNCTIONS)}
              onToggle={() => toggle(FUNCTIONS)}
              register={register}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The object editor's C12 factory. It keeps event text in the store's documents (shared with code tabs). */
export function createObjectEditorFactory(ide: Ide): EditorPanelFactory {
  return {
    kind: "object",
    canOpen: (r) => r.kind === "object",
    create({ element, host }): EditorPanel {
      installDocumentSync(ide);
      const root = createRoot(element);
      let id = "object:";
      return {
        get id() {
          return id;
        },
        kind: "object",
        open(resource) {
          id = `object:${resource.name}`;
          root.render(<ObjectEditorView host={host} actions={ide.actions} name={resource.name} />);
        },
        // Properties and event text live in the store, which Save writes (project.save).
        async save() {},
        dispose() {
          root.unmount();
        },
        onDirty() {
          return () => {};
        },
      };
    },
  };
}
