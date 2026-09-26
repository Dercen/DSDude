/**
 * The Learn panel host (PLAN.md 6 WS6; WS7 writes the content): the contents of docs/tutorial, docs/manual and
 * docs/reference, and one document rendered from markdown (sanitised, local images only), with copyable code blocks.
 * Links never navigate the window: Learn links and relative .md links open here, "#" links scroll, web links show a
 * toast with the address.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useActions, useIde } from "../ide-context.tsx";
import { ipc, parseIpcError } from "../ipc.ts";
import { parseLearnUri } from "../panels/api.ts";
import { renderMarkdown, resolveDocLink } from "./markdown.ts";

interface LearnDoc {
  path: string;
  title: string;
  section: "tutorial" | "manual" | "reference";
}

const SECTION_TITLES = { tutorial: "Tutorial", manual: "Manual", reference: "Reference" } as const;

type Shown = { path: string; html: string } | { path: string; error: string } | null;

function addCopyButtons(root: HTMLElement): void {
  for (const pre of root.querySelectorAll("pre")) {
    if (pre.querySelector(".learn-copy")) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "learn-copy";
    button.textContent = "Copy";
    button.addEventListener("click", () => {
      const text = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      void navigator.clipboard.writeText(text).then(
        () => {
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = "Copy";
          }, 1500);
        },
        () => {
          button.textContent = "Select and copy";
        },
      );
    });
    pre.prepend(button);
  }
}

export function LearnPanel() {
  const learn = useIde((s) => s.learn);
  const actions = useActions();
  const [docs, setDocs] = useState<LearnDoc[] | null>(null);
  const [shown, setShown] = useState<Shown>(null);
  const body = useRef<HTMLDivElement>(null);
  const path = learn.target?.path ?? null;

  useEffect(() => {
    ipc.invoke("learn.list", {}).then(
      (r) => setDocs(r.docs),
      () => setDocs([]),
    );
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: learn.seq reloads the same document on request.
  useEffect(() => {
    if (!path) {
      setShown(null);
      return;
    }
    let live = true;
    ipc.invoke("learn.read", { path }).then(
      (r) => live && setShown({ path, html: renderMarkdown(r.markdown, r.images) }),
      (err: unknown) => live && setShown({ path, error: parseIpcError(err).message }),
    );
    return () => {
      live = false;
    };
  }, [path, learn.seq]);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !shown || "error" in shown) return;
    addCopyButtons(el);
    const anchor = learn.target?.anchor;
    const target = anchor ? el.querySelector(`[id="${CSS.escape(anchor)}"], a[name="${CSS.escape(anchor)}"]`) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else el.scrollTop = 0;
  }, [shown, learn.target?.anchor]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    e.preventDefault();
    const learnLink = parseLearnUri(href);
    if (learnLink) return actions.openLearn(learnLink);
    if (href.startsWith("#")) {
      const el = body.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
      el?.scrollIntoView({ block: "start" });
      return;
    }
    const doc = path ? resolveDocLink(path, href) : null;
    if (doc) return actions.openLearn(doc);
    if (/^https?:/i.test(href)) actions.showToast(`This link opens on the web: ${href}`);
  };

  const contents = (
    <nav className="learn-toc" aria-label="Learn contents">
      {docs === null ? <p>Loading…</p> : null}
      {docs?.length === 0 ? <p>No Learn documents yet.</p> : null}
      {(["tutorial", "manual", "reference"] as const).map((section) => {
        const list = docs?.filter((d) => d.section === section) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={section} className="learn-toc-section">
            <h3>{SECTION_TITLES[section]}</h3>
            {list.map((d) => (
              <button
                type="button"
                key={d.path}
                className={`learn-toc-item${d.path === path ? " active" : ""}`}
                data-testid={`learn-doc:${d.path}`}
                onClick={() => actions.openLearn({ path: d.path })}
              >
                {d.title}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="learn" data-testid="learn">
      {contents}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: link clicks are delegated; keyboard users follow the links themselves. */}
      <div ref={body} className="learn-body" onClick={onClick}>
        {shown === null ? (
          <div className="learn-home">
            <h1>Learn</h1>
            <p>Start with the tutorial, then read the manual. Press F1 on a function name to see its reference.</p>
          </div>
        ) : "error" in shown ? (
          <p className="learn-error">
            Could not open {shown.path}: {shown.error}
          </p>
        ) : (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown sanitises with DOMPurify (local images only).
          <article className="learn-doc" data-testid="learn-doc" dangerouslySetInnerHTML={{ __html: shown.html }} />
        )}
      </div>
    </div>
  );
}
