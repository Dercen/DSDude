/** The project tree: resources by kind; objects expand to their events and Functions. */
import type { Project } from "@dsdude/project-format";
import { type ReactNode, useState } from "react";
import { useActions, useIde } from "../ide-context.tsx";
import { eventDocId, eventLabel, functionsDocId, resourceDocId, scriptDocId, sortEvents } from "../store/documents.ts";

function Item({ label, docId, depth, dirty }: { label: string; docId: string; depth: number; dirty: boolean }) {
  const actions = useActions();
  return (
    <button
      type="button"
      className="tree-item"
      style={{ paddingLeft: 8 + depth * 14 }}
      data-testid={`tree:${docId}`}
      onClick={() => actions.openDocument(docId)}
    >
      {label}
      {dirty ? " ●" : ""}
    </button>
  );
}

function Section({ title, children, count }: { title: string; children: ReactNode; count: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="tree-section">
      <button type="button" className="tree-heading" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title} <span className="tree-count">{count}</span>
      </button>
      {open ? children : null}
    </div>
  );
}

function ObjectNode({ obj, dirty }: { obj: Project["objects"][number]; dirty: Record<string, true> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="tree-item"
        style={{ paddingLeft: 22 }}
        data-testid={`tree:object:${obj.name}`}
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} {obj.name}
      </button>
      {open ? (
        <>
          <Item label="Properties" docId={resourceDocId("objects", obj.name)} depth={3} dirty={false} />
          {sortEvents(Object.keys(obj.events)).map((ev) => {
            const id = eventDocId(obj.name, ev);
            return <Item key={id} label={eventLabel(ev)} docId={id} depth={3} dirty={!!dirty[id]} />;
          })}
          {obj.functions !== null ? (
            <Item
              label="Functions"
              docId={functionsDocId(obj.name)}
              depth={3}
              dirty={!!dirty[functionsDocId(obj.name)]}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ProjectTree() {
  const project = useIde((s) => s.project);
  const dirty = useIde((s) => s.dirty);
  const actions = useActions();
  if (!project)
    return (
      <div className="panel-empty">
        <p>No project is open.</p>
        <button type="button" onClick={() => void actions.chooseAndOpenProject()}>
          Open a project…
        </button>
      </div>
    );
  const plain = (kind: "sprites" | "backgrounds" | "sounds" | "rooms", title: string) => (
    <Section title={title} count={project[kind].length}>
      {project[kind].map((r) => (
        <Item key={r.name} label={r.name} docId={resourceDocId(kind, r.name)} depth={1} dirty={false} />
      ))}
    </Section>
  );
  return (
    <div className="tree" data-testid="project-tree">
      <div className="tree-title" title={project.dir}>
        {project.project.title}
      </div>
      {plain("sprites", "Sprites")}
      {plain("backgrounds", "Backgrounds")}
      {plain("sounds", "Sounds")}
      <Section title="Objects" count={project.objects.length}>
        {project.objects.map((o) => (
          <ObjectNode key={o.name} obj={o} dirty={dirty} />
        ))}
      </Section>
      {plain("rooms", "Rooms")}
      <Section title="Scripts" count={project.scripts.length}>
        {project.scripts.map((s) => (
          <Item
            key={s.name}
            label={s.name}
            docId={scriptDocId(s.name)}
            depth={1}
            dirty={!!dirty[scriptDocId(s.name)]}
          />
        ))}
      </Section>
      <Item label="Game Settings" docId="project.json" depth={0} dirty={false} />
    </div>
  );
}
